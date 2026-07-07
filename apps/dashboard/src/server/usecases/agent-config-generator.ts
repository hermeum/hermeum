import { z } from "zod";

import {
  AgentEnvVar,
  AgentInput,
  AgentInputObjectSchema,
  Context,
  ENV_PLACEHOLDER_SENTINEL,
  ENV_SECRET_SENTINEL,
} from "@/entities";

import { AiConfigGenerator } from "../infras/ai/generator";
import { ConfigGenerator } from "./adaptors/generator";

export const PromptSchema = z.string().min(1).max(4000);
export type Prompt = z.infer<typeof PromptSchema>;

export class AgentConfigGeneratorUseCase {
  constructor(private readonly generator: ConfigGenerator = new AiConfigGenerator()) {}

  async create(ctx: Context, prompt: Prompt): Promise<AgentInput> {
    prompt = PromptSchema.parse(prompt);
    const output = await this.generator.generate(
      `Create a new Hermes agent definition from this request:\n\n${prompt}`
    );
    return this.finalize(output);
  }

  async update(ctx: Context, current: AgentInput, prompt: Prompt): Promise<AgentInput> {
    prompt = PromptSchema.parse(prompt);
    const output = await this.generator.generate(
      "Here is an existing Hermes agent definition as JSON:\n\n" +
        JSON.stringify(current, null, 2) +
        "\n\nApply the following change and return the FULL revised definition " +
        "(keep everything not affected by the change unchanged):\n\n" +
        prompt
    );
    return this.finalize(output, current.env ?? []);
  }

  private finalize(output: AgentInput, existingEnv: readonly AgentEnvVar[] = []): AgentInput {
    const parsed = AgentInputObjectSchema.parse(output);
    return { ...parsed, env: this.scrubEnv(parsed, existingEnv) };
  }

  // The system prompt asks for these invariants, but LLMs occasionally slip;
  // patch the output rather than reject it so the prefill stays usable.
  private scrubEnv(
    parsed: AgentInput,
    existingEnv: readonly AgentEnvVar[]
  ): AgentEnvVar[] | undefined {
    const existingSensitive = new Set(
      existingEnv.filter((v) => v.sensitive === true).map((v) => v.name)
    );

    // Never pass through generated secret values: sensitive vars may only hold
    // the fill-me placeholder, or "<secret>" when it round-trips an already
    // stored secret (the kubernetes client reuses the stored value for it).
    const env = (parsed.env ?? []).map((v) => {
      if (!v.sensitive || v.value === ENV_PLACEHOLDER_SENTINEL) return v;
      if (v.value === ENV_SECRET_SENTINEL && existingSensitive.has(v.name)) return v;
      return { ...v, value: ENV_PLACEHOLDER_SENTINEL };
    });

    const requireSensitiveEnv = (name: string) => {
      if (!env.some((v) => v.name === name && v.sensitive === true)) {
        env.push({ name, value: ENV_PLACEHOLDER_SENTINEL, sensitive: true });
      }
    };
    if (parsed.config?.platforms?.webhook?.enabled === true) {
      requireSensitiveEnv("WEBHOOK_SECRET");
    }
    if (parsed.config?.api_server?.enabled === true) {
      requireSensitiveEnv("API_SERVER_KEY");
    }

    return env.length > 0 ? env : parsed.env;
  }
}
