---
name: video-gen
category: tools
description: Video generation configuration (`config.video_gen`) — provider plugins (xAI, FAL, DeepInfra), model families, and FAL_KEY / XAI_API_KEY env vars.
---

# Video generation configuration (`config.video_gen`)

Configures the `video_generate` tool, which lets the agent generate video
from a text prompt (text-to-video) or from a prompt plus a source image
(image-to-video). Every backend is a provider plugin; the active provider
is picked by `video_gen.provider` in `config.yaml`.

This app documents the **xAI** and **FAL** providers. DeepInfra (bundled
as a built-in provider) and user-installed plugins are
also supported and pass through unchanged; only xAI and FAL are covered
here.

The toolset auto-enables when **either** `FAL_KEY` **or** `XAI_API_KEY`
is set. Without one of them, the `video_generate` tool does not register.

## Unified surface (one tool, two modalities)

The `video_generate` tool exposes two modalities through one parameter:

- **Text-to-video** — call with `prompt` only. The provider routes to
  its text-to-video endpoint.
- **Image-to-video** — call with `prompt` + `image_url`. The provider
  routes to its image-to-video endpoint.

The provider picks the right endpoint internally based on whether
`image_url` was passed; the agent never thinks about endpoints.

## Fields

- `provider` — active video-gen provider plugin id. Documented here:
  `xai`, `fal`. Other bundled providers (e.g. `deepinfra`) and
  user-installed plugins are also accepted. Default `fal` when
  `FAL_KEY` is set, otherwise `xai` when `XAI_API_KEY` is set.
  Selecting a provider without its required env var leaves the toolset
  unavailable.
- `model` — model **family** id (e.g. `veo3.1`, `kling-o3`,
  `grok-imagine-video`). A family groups a text-to-video and an
  image-to-video endpoint behind one user-facing name; the provider's
  `generate()` routes within the family. Omit to use the provider's
  `default_model()`.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FAL_KEY` | FAL.ai API key. Enables the `fal` provider. Get one at [fal.ai](https://fal.ai/). | _(required for `provider: fal`)_ |
| `XAI_API_KEY` | Paid xAI (Grok) API key. Enables the `xai` provider (Grok Imagine video). | _(required for `provider: xai`)_ |

## Example

### FAL (Veo 3.1)

```yaml
config:
  video_gen:
    provider: fal
    model: fal-ai/veo3.1
env:
  - name: FAL_KEY
    value: fal-your-key-here
    sensitive: true
```

### xAI (Grok Imagine)

```yaml
config:
  video_gen:
    provider: xai
env:
  - name: XAI_API_KEY
    value: xai-your-key-here
    sensitive: true
```