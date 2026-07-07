import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createProviderRegistry, generateText, Output } from "ai";
import { createOllama } from "ai-sdk-ollama";

import {
  AgentInput,
  AgentInputObjectSchema,
  ENV_PLACEHOLDER_SENTINEL,
  ENV_SECRET_SENTINEL,
} from "@/entities";
import { config } from "@/server/libs/config";

import { ConfigGenerator } from "../../usecases/adaptors/generator";

// Field semantics live in the output schema's .describe() texts; this prompt
// only carries the task framing and cross-field rules.
const SYSTEM_PROMPT = `You generate Hermes agent definitions for the Hermeum dashboard — a JSON
object that prefills the create-agent form for an autonomous LLM agent deployed to
Kubernetes. Field semantics are defined by the output schema.

Rules:
- Credentials in env must have sensitive: true and the literal value
  "${ENV_PLACEHOLDER_SENTINEL}" — never invent or guess secret values.
- When config.platforms.webhook.enabled is true, env MUST include a sensitive
  WEBHOOK_SECRET; when config.api_server.enabled is true, a sensitive
  API_SERVER_KEY (both with value "${ENV_PLACEHOLDER_SENTINEL}").
- Sensitive values shown as "${ENV_SECRET_SENTINEL}" in an existing definition are stored
  secrets — keep them as the literal "${ENV_SECRET_SENTINEL}" when revising.
- Only enable features the request calls for. Prefer minimal, valid output.`;

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
