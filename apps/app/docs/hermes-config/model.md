---
name: model
category: core
description: LLM model configuration (`config.model`) — providers, model ids, base URLs, and required API-key env vars.
---

# LLM model configuration (`config.model`)

Configures which LLM provider and model the Hermes agent uses. Only set this
when the request names a specific provider or model; otherwise omit it so the
platform default applies.

## Fields

- `provider` — the LLM provider that serves the model. OAuth-gated providers are
  **omitted** there — Hermeum does not support browser OAuth in container
  mode: `nous`, `openai-codex`, `copilot`, `copilot-acp`, `xai-oauth`,
  `qwen-oauth`, `minimax-oauth`, and `vertex`. 
- `default` — default model identifier used for requests, e.g.
  `moonshotai/kimi-k2.5` or `gpt-5`. Upstream also accepts `model:` as
  an alias key for the same value — both work identically; Hermeum
  documents `default`.
- `base_url` — base URL of the provider's API endpoint, e.g.
  `https://api.novita.ai/openai/v1`. Omit to use the provider default.

## Requirements

Setting a model requires an env var holding the provider's API key, marked
`sensitive: true`. The table below maps every API-key provider to its env
var (per the official
[providers document](https://hermes-agent.nousresearch.com/docs/integrations/providers)).

| Provider               | Env var                       | Notes                                                                                                               |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `anthropic`            | `ANTHROPIC_API_KEY`           | Pay-per-token; independent of Claude subscriptions.                                                                 |
| `openrouter`           | `OPENROUTER_API_KEY`          |                                                                                                                     |
| `router`               | `RAMP_ROUTER_API_KEY`         | Alias `ROUTER_API_KEY` also accepted.                                                                               |
| `fireworks`            | `FIREWORKS_API_KEY`           | Endpoint overrides go through `model.base_url` in config, not env.                                                  |
| `novita`               | `NOVITA_API_KEY`              |                                                                                                                     |
| `ai-gateway`           | `AI_GATEWAY_API_KEY`          |                                                                                                                     |
| `zai`                  | `GLM_API_KEY`                 | Aliases `ZAI_API_KEY` / `Z_AI_API_KEY`; endpoint auto-detected.                                                     |
| `kimi-coding`          | `KIMI_API_KEY`                | `KIMI_CODING_API_KEY` accepted alongside.                                                                           |
| `kimi-coding-cn`       | `KIMI_CN_API_KEY`             | China endpoint.                                                                                                     |
| `arcee`                | `ARCEEAI_API_KEY`             |                                                                                                                     |
| `gmi`                  | `GMI_API_KEY`                 |                                                                                                                     |
| `nebius-token-factory` | `NEBIUS_API_KEY`              | `NEBIUS_TOKEN_FACTORY_API_KEY` also accepted.                                                                       |
| `actual`               | `ACTUAL_API_KEY`              | Hosted relay. For the local daemon set `ACTUAL_BASE_URL=http://127.0.0.1:8080` instead — no key needed on loopback. |
| `minimax`              | `MINIMAX_API_KEY`             | Global endpoint.                                                                                                    |
| `minimax-cn`           | `MINIMAX_CN_API_KEY`          | China endpoint.                                                                                                     |
| `xai`                  | `XAI_API_KEY`                 | Also used by `x_search`, TTS, and image gen.                                                                        |
| `alibaba`              | `DASHSCOPE_API_KEY`           | Qwen Cloud (Alibaba DashScope).                                                                                     |
| `alibaba-coding-plan`  | `ALIBABA_CODING_PLAN_API_KEY` | Falls back to `DASHSCOPE_API_KEY`. Separate billing SKU.                                                            |
| `alibaba-token-plan`   | `ALIBABA_TOKEN_PLAN_API_KEY`  | Model Studio flat-token tier.                                                                                       |
| `kilocode`             | `KILOCODE_API_KEY`            |                                                                                                                     |
| `xiaomi`               | `XIAOMI_API_KEY`              |                                                                                                                     |
| `tencent-tokenhub`     | `TOKENHUB_API_KEY`            |                                                                                                                     |
| `tencent-tokenplan`    | `TOKENPLAN_API_KEY`           | Anthropic Messages endpoint.                                                                                        |
| `opencode-zen`         | `OPENCODE_ZEN_API_KEY`        |                                                                                                                     |
| `opencode-go`          | `OPENCODE_GO_API_KEY`         |                                                                                                                     |
| `opencode-free`        | _(none)_                      | Keyless — requests are sent anonymously.                                                                            |
| `commandcode`          | `COMMANDCODE_API_KEY`         | Claude models via the `commandcode-anthropic` alias.                                                                |
| `deepseek`             | `DEEPSEEK_API_KEY`            |                                                                                                                     |
| `huggingface`          | `HF_TOKEN`                    | Token must have "Make calls to Inference Providers" enabled.                                                        |
| `gemini`               | `GOOGLE_API_KEY`              | `GEMINI_API_KEY` accepted as an alias.                                                                              |
| `openai-api`           | `OPENAI_API_KEY`              | Optional `OPENAI_BASE_URL`.                                                                                         |
| `azure-foundry`        | `AZURE_FOUNDRY_API_KEY`       | Microsoft Foundry / Azure OpenAI endpoint and key.                                                                  |
| `bedrock`              | _(none)_                      | Standard AWS credential chain via boto3 — no static key; `AWS_PROFILE` / `AWS_REGION` apply.                        |
| `nvidia`               | `NVIDIA_API_KEY`              | NIM-hosted models on build.nvidia.com.                                                                              |
| `ollama-cloud`         | `OLLAMA_API_KEY`              | Cloud-hosted Ollama catalog.                                                                                        |
| `stepfun`              | `STEPFUN_API_KEY`             |                                                                                                                     |
| `lmstudio`             | `LM_API_KEY`                  | Optional — only needed when LM Studio server auth is enabled.                                                       |
| `custom`               | `OPENAI_API_KEY`              | Used with `OPENAI_BASE_URL` or `model.base_url`.                                                                    |

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
