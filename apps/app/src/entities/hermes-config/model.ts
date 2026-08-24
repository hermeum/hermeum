import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/integrations/providers
// Full field semantics: docs/hermes-config/model.md
export const ModelProviderSchema = z
  .enum([
    "nous",
    "openai-codex",
    "copilot",
    "copilot-acp",
    "anthropic",
    "openrouter",
    "novita",
    "zai",
    "kimi-coding",
    "kimi-coding-cn",
    "arcee",
    "gmi",
    "minimax",
    "minimax-cn",
    "xai",
    "xai-oauth",
    "alibaba",
    "alibaba-coding-plan",
    "kilocode",
    "xiaomi",
    "tencent-tokenhub",
    "opencode-zen",
    "opencode-go",
    "deepseek",
    "huggingface",
    "gemini",
    "vertex",
    "openai-api",
    "azure-foundry",
    "bedrock",
    "nvidia",
    "ollama-cloud",
    "qwen-oauth",
    "minimax-oauth",
    "stepfun",
    "lmstudio",
    "custom",
  ])
  .describe("LLM provider.");

export type ModelProvider = z.infer<typeof ModelProviderSchema>;

export const ModelSchema = z
  .looseObject({
    provider: ModelProviderSchema,
    default: z.string().min(1).describe("Default model id."),
    base_url: z
      .url()
      .optional()
      .describe("Provider API endpoint URL."),
  })
  .optional()
  .describe("LLM model configuration.");

export type Model = z.infer<typeof ModelSchema>;