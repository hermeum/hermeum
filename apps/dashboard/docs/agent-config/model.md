# LLM model configuration (`config.model`)

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

```yaml
model:
  provider: openai-api
  default: gpt-5.5
```
