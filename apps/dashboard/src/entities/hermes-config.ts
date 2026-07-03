import { z } from "zod";

export const ModelProviderSchema = z
  .union([z.enum(["novita", "openai", "anthropic", "openrouter"]), z.string()])
  .describe(
    "LLM provider that serves the model. Prefer one of the known providers; " +
      "any other provider name is also accepted."
  );

export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelSchema = z
  .looseObject({
    provider: ModelProviderSchema,
    default: z
      .string()
      .min(1)
      .describe(
        'Default model identifier used for requests, e.g. "moonshotai/kimi-k2.5" or "gpt-5".'
      ),
    base_url: z
      .url()
      .optional()
      .describe(
        "Base URL of the provider's API endpoint, " +
          'e.g. "https://api.novita.ai/openai/v1". Omit to use the provider default.'
      ),
  })
  .describe("LLM model configuration for the agent.");

export type Model = z.infer<typeof ModelSchema>;

export const ConfigSchema = z
  .looseObject({
    model: ModelSchema.optional().describe(
      "Model configuration to use."
    ),
  })
  .optional()
  .describe(
    "Hermes agent configuration. Only well-known fields are validated here; " +
      "any additional fields are passed through unchanged."
  );

export type Config = z.infer<typeof ConfigSchema>;
