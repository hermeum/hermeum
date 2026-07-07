import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry, generateText, Output } from "ai";
import { createOllama } from "ai-sdk-ollama";

import { AgentInput, AgentInputObjectSchema, ENV_PLACEHOLDER_SENTINEL } from "@/entities";
import { config } from "@/server/libs/config";

import { ConfigGenerator } from "../../usecases/adaptors/generator";

const SYSTEM_PROMPT = `You generate Hermes agent definitions for the Hermeum dashboard.

A Hermes agent is an autonomous LLM agent deployed to Kubernetes. You return a JSON
object that prefills the create-agent form:
- name: short and descriptive.
- description: one or two sentences.
- soul: the agent's persona and operating instructions in markdown (like a system prompt).
- config: the agent runtime config.
  - config.model: which LLM the agent itself uses. provider is one of anthropic,
    openrouter, zai, kimi-coding, openai-api, ollama-cloud (others allowed);
    "default" is the model id. Each provider needs its credential as a sensitive
    env var (e.g. OPENAI_API_KEY for openai-api, ANTHROPIC_API_KEY for anthropic).
  - config.platforms.webhook: enable only if the user wants to trigger the agent
    via webhooks; define routes under platforms.webhook.extra.routes.
  - config.api_server: enable only if the user wants a direct HTTP API.
- skills: only include skills the user explicitly asked for.
- env: environment variables. Credentials must have sensitive: true and the literal
  value "${ENV_PLACEHOLDER_SENTINEL}" — never invent or guess secret values.
  When config.platforms.webhook.enabled is true, env MUST include
  {"name":"WEBHOOK_SECRET","value":"${ENV_PLACEHOLDER_SENTINEL}","sensitive":true}.
  When config.api_server.enabled is true, env MUST include
  {"name":"API_SERVER_KEY","value":"${ENV_PLACEHOLDER_SENTINEL}","sensitive":true}.
  Sensitive values shown as "<secret>" in an existing definition are stored secrets —
  keep them as the literal "<secret>" when revising.

Only enable features the request calls for. Prefer minimal, valid output.`;

export class AiConfigGenerator implements ConfigGenerator {
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
      ollama: createOllama(baseURL),
    });
    return this.registry.languageModel(config.aiModel as `${string}:${string}`);
  }

  async generate(prompt: string): Promise<AgentInput> {
    // Do not enable providerOptions.openai.strictJsonSchema — the schema
    // uses looseObject/record/optionals, which strict mode rejects.
    const result = await generateText({
      model: this.model(),
      system: SYSTEM_PROMPT,
      prompt,
      output: Output.object({ schema: AgentInputObjectSchema }),
    });
    return result.output;
  }
}
