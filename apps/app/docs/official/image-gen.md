---
name: image-gen
category: tools
description: Image generation configuration (`config.image_gen`) — FAL.ai models, max parallel requests, and FAL_KEY env var.
---

# Image generation configuration (`config.image_gen`)

Configures the `image_generate` tool, which lets the agent generate images
from text prompts (and edit existing images on edit-capable models). It is
backed by FAL.ai or other provider plugins.

The toolset auto-enables when `FAL_KEY` is set. Without it, the
`image_generate` tool does not register.

## Fields

- `provider` — the single selection key for the image-gen backend.
  A vendor name (`fal`, `openai`, `xai`, `krea`, `openrouter`, ...) goes
  direct with your own key. The stored selection always wins:
  `provider: fal` without `FAL_KEY` errors rather than silently
  rerouting. Default `fal` when `FAL_KEY` is set. Upstream also accepts
  `nous` (the managed Tool Gateway), but Hermeum does not surface it —
  it requires Nous Portal OAuth, which is not supported in container
  mode.
- `model` — FAL.ai model id. Default
  `fal-ai/flux-2/klein/9b`. Eleven models are supported out of the box;
  `fal-ai/flux-2-pro` (studio photorealism),
  `fal-ai/z-image/turbo` (bilingual EN/CN),
  `fal-ai/nano-banana-pro` (Gemini 3 Pro, reasoning depth),
  `fal-ai/gpt-image-2` (SOTA text rendering + CJK),
  `fal-ai/ideogram/v3` (best typography),
  `fal-ai/recraft/v4/pro/text-to-image` (design / brand systems),
  `fal-ai/qwen-image` (LLM-based, complex text),
  `fal-ai/krea/v2/{medium,large}/text-to-image` (illustration / photorealism).
  With `provider: openrouter`, the picker lists OpenRouter's entire live
  image catalog instead.
- `max_parallel_requests` — concurrent images per tool-call batch
  (default `4`). Hermes clamps it to at least one and to the global
  tool-worker limit, so image providers receive bounded parallel requests
  without allowing an image batch to bypass the agent's concurrency cap.

Upscaling is now **opt-in only** — no model upscales by default; it runs
solely when the agent explicitly requests it (upscalers are creative
enhancers that can degrade rendered text and fine detail).

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FAL_KEY` | FAL.ai API key. Required for image generation. Get one at [fal.ai](https://fal.ai/). | _(required)_ |

## Example

### FAL.ai with a direct key

```yaml
config:
  image_gen:
    provider: fal
    model: fal-ai/flux-2/klein/9b
    max_parallel_requests: 4
env:
  - name: FAL_KEY
    value: fal-your-key-here
    sensitive: true
```