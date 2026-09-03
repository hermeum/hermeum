---
name: model
category: core
description: LLM model configuration (`config.model`) — providers, model ids, base URLs, and required API-key env vars.
---

# LLM model configuration (`config.model`)

> **TODO (pending PR):** the current upstream adds the providers `router`,
> `fireworks`, `ai-gateway`, `actual`, `alibaba-token-plan` (+ `-cn`),
> `commandcode`, `nebius-token-factory`, `opencode-free`,
> `tencent-tokenplan`, and accepts `model: { model: id }` as an alias for
> `model: { default: id }`. The provider list below is still the
> v2026.7.7.2 set — it will be updated in a separate PR, in lockstep with
> `src/entities/hermes-config/model.ts`. Do not edit until then.

Configures which LLM provider and model the Hermes agent uses. Only set this
when the request names a specific provider or model; otherwise omit it so the
platform default applies.

## Fields

- `provider` — the LLM provider that serves the model. Supported values:
  `nous`, `openai-codex`, `copilot`, `copilot-acp`, `anthropic`, `openrouter`,
  `novita`, `zai`, `kimi-coding`, `kimi-coding-cn`, `arcee`, `gmi`, `minimax`,
  `minimax-cn`, `xai`, `xai-oauth`, `alibaba`, `alibaba-coding-plan`,
  `kilocode`, `xiaomi`, `tencent-tokenhub`, `opencode-zen`, `opencode-go`,
  `deepseek`, `huggingface`, `gemini`, `vertex`, `openai-api`, `azure-foundry`,
  `bedrock`, `nvidia`, `ollama-cloud`, `qwen-oauth`, `minimax-oauth`,
  `stepfun`, `lmstudio`, `custom`.
- `default` — default model identifier used for requests, e.g.
  `moonshotai/kimi-k2.5` or `gpt-5`.
- `base_url` — base URL of the provider's API endpoint, e.g.
  `https://api.novita.ai/openai/v1`. Omit to use the provider default.

## Requirements

Setting a model requires an env var holding the provider's API key, marked
`sensitive: true` — e.g. `ANTHROPIC_API_KEY` for `provider: anthropic`,
`OPENAI_API_KEY` for `provider: openai-api`.

## Example

### OpenAI API provider with a required key

```yaml
config:
  model:
    provider: openai-api
    default: gpt-5.5
env:
  - name: OPENAI_API_KEY
    value: sk-...
    sensitive: true
```
