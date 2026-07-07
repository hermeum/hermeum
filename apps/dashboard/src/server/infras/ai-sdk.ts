import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry, generateText, NoObjectGeneratedError, Output } from "ai";
import { createOllama } from "ai-sdk-ollama";

import { AgentInput, AgentInputObjectSchema } from "@/entities";
import { config } from "@/server/libs/config";

import { AiGenerator } from "../usecases/adaptors/generator";

export class AiSdkGenerator implements AiGenerator {
  // Lazy: built on first use so the dashboard boots without any AI config
  // and fails with a clear error only when the feature is called.
  private registry: ReturnType<typeof createProviderRegistry> | undefined;

  private model() {
    if (!config.aiModel) {
      throw new Error(
        'AI config generation is not configured: set HERMEUM_AI_MODEL to "provider:model", ' +
          'e.g. "anthropic:claude-sonnet-5", "openai:gpt-5", or "ollama:qwen3:8b".'
      );
    }
    // HERMEUM_AI_BASE_URL applies to whichever provider HERMEUM_AI_MODEL
    // selects; passing it to all is safe since only one is used.
    const baseURL = config.aiBaseUrl ? { baseURL: config.aiBaseUrl } : {};
    this.registry ??= createProviderRegistry({
      anthropic: createAnthropic(baseURL),
      openai: createOpenAI(baseURL),
      // Unlike the anthropic/openai SDKs, ai-sdk-ollama does not read its
      // credential env var itself; pass it for Ollama Cloud / remote servers.
      ollama: createOllama({
        ...baseURL,
        ...(process.env.OLLAMA_API_KEY ? { apiKey: process.env.OLLAMA_API_KEY } : {}),
      }),
    });
    return this.registry.languageModel(config.aiModel as `${string}:${string}`);
  }

  async generateAgentInput(input: { system: string; prompt: string }): Promise<AgentInput> {
    try {
      // Do not enable providerOptions.openai.strictJsonSchema — the schema
      // uses looseObject/record/optionals, which strict mode rejects.
      const result = await generateText({
        model: this.model(),
        system: input.system,
        prompt: input.prompt,
        output: Output.object({ schema: AgentInputObjectSchema }),
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
