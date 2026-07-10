import { createOpenAI } from "@ai-sdk/openai";
import { generateText, isStepCount, NoObjectGeneratedError, Output, tool, ToolSet } from "ai";

import { AgentInput, AgentInputObjectSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { AiGenerator, AiGeneratorTool } from "../usecases/adaptors/generator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toToolSet(tools?: Record<string, AiGeneratorTool<any>>): ToolSet | undefined {
  if (!tools) return undefined;
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [
      name,
      tool({ description: t.description, inputSchema: t.inputSchema, execute: t.execute }),
    ])
  );
}

export class AiSdkGenerator implements AiGenerator {
  // Lazy: built on first use so the dashboard boots without any AI config
  // and fails with a clear error only when the feature is called.
  private openai: ReturnType<typeof createOpenAI> | undefined;

  private model() {
    if (!config.openaiModel) {
      throw new Error(
        "AI config generation is not configured: set HERMEUM_AI_MODEL to an OpenAI model id, " +
          'e.g. "gpt-5.5".'
      );
    }
    const baseURL = config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {};
    this.openai ??= createOpenAI(baseURL);
    return this.openai(config.openaiModel);
  }

  async generateAgentInput(input: {
    system: string;
    prompt: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools?: Record<string, AiGeneratorTool<any>>;
  }): Promise<AgentInput> {
    try {
      // Explicitly disable strict JSON schema mode — the schema uses
      // looseObject/record/optionals, which strict mode rejects. Chat
      // Completions models default this to false, but Responses API models
      // (e.g. gpt-5.5) default it to true, so it must be set here.
      const tools = toToolSet(input.tools);
      // Default stopWhen is isStepCount(1), which leaves no room for a tool
      // call followed by the structured-output step.
      const toolOptions = tools ? { tools, stopWhen: isStepCount(5) } : {};
      const result = await generateText({
        model: this.model(),
        system: input.system,
        prompt: input.prompt,
        ...toolOptions,
        output: Output.object({ schema: AgentInputObjectSchema }),
        providerOptions: {
          openai: { strictJsonSchema: false },
        },
      });
      return result.output;
    } catch (e) {
      // Surface the model response in the message: the default one only says
      // parsing failed, hiding whether the output was truncated (finishReason
      // "length"), empty, or wrapped in non-JSON prose.
      if (NoObjectGeneratedError.isInstance(e)) {
        const text = e.text ?? "";
        throw new Error(
          `AI generation returned an unusable response (finishReason: ${e.finishReason}, ` +
            `${text.length} chars): ${text.slice(0, 300) || "<empty>"}`,
          { cause: e }
        );
      }
      throw e;
    }
  }
}
