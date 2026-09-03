import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/integrations/providers
// Full field semantics: docs/hermes-config/model.md
//
// Skipped on purpose: OAuth-gated providers are omitted — Hermeum does not
// support browser OAuth in container mode, so there is no way to authorize
// them. Excluded: nous, openai-codex, copilot, copilot-acp, xai-oauth,
// qwen-oauth, minimax-oauth, vertex (service-account OAuth2 / ADC). They
// still pass through via looseObject if written by hand.
//
// Upstream accepts either `default` or `model` as the key for the model id;
// both work identically.
export const ModelProviderSchema = z
  .enum([
    "anthropic",
    "openrouter",
    "router",
    "fireworks",
    "novita",
    "ai-gateway",
    "zai",
    "kimi-coding",
    "kimi-coding-cn",
    "arcee",
    "gmi",
    "nebius-token-factory",
    "actual",
    "minimax",
    "minimax-cn",
    "xai",
    "alibaba",
    "alibaba-coding-plan",
    "alibaba-token-plan",
    "kilocode",
    "xiaomi",
    "tencent-tokenhub",
    "tencent-tokenplan",
    "opencode-zen",
    "opencode-go",
    "opencode-free",
    "commandcode",
    "deepseek",
    "huggingface",
    "gemini",
    "openai-api",
    "azure-foundry",
    "bedrock",
    "nvidia",
    "ollama-cloud",
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