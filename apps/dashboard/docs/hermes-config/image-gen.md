---
name: image-gen
category: tools
description: Image generation configuration (`config.image_gen`) — FAL.ai models, max parallel requests, and FAL_KEY env var.
---

# Image generation configuration (`config.image_gen`)

Configures the `image_generate` tool, which lets the agent generate images
from text prompts (and edit existing images on edit-capable models). It is
backed by FAL.ai.

The toolset auto-enables when `FAL_KEY` is set. Without it, the
`image_generate` tool does not register.

## Fields

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
- `max_parallel_requests` — concurrent images per tool-call batch
  (default `4`). Hermes clamps it to at least one and to the global
  tool-worker limit, so image providers receive bounded parallel requests
  without allowing an image batch to bypass the agent's concurrency cap.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FAL_KEY` | FAL.ai API key. Required for image generation. Get one at [fal.ai](https://fal.ai/). | _(required)_ |

## Example

```yaml
config:
  image_gen:
    model: fal-ai/flux-2/klein/9b
    max_parallel_requests: 4
env:
  - name: FAL_KEY
    value: fal-your-key-here
    sensitive: true
```