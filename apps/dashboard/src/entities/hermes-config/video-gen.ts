import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/developer-guide/video-gen-provider-plugin
// Full field semantics: docs/hermes-config/video-gen.md
// Only the essential fields are validated here; the rest pass through via
// looseObject so users can configure whatever the Hermes agent supports.
export const VideoGenSchema = z
  .looseObject({
    provider: z
      .string()
      .optional()
      .describe("Active video-gen provider plugin id (e.g. fal, xai, deepinfra). Default fal."),
    model: z
      .string()
      .optional()
      .describe("Model family id (e.g. fal-ai/veo3.1, kling-o3). Falls back to the provider default."),
  })
  .optional()
  .describe("Video generation configuration. Requires FAL_KEY or XAI_API_KEY.");

export type VideoGen = z.infer<typeof VideoGenSchema>;