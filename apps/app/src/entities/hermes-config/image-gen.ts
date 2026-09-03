import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/image-generation
// Full field semantics: docs/hermes-config/image-gen.md
//
// Skipped on purpose: provider value "nous" (managed Tool
// Gateway) is omitted — it requires Nous Portal OAuth, which is not
// supported in container mode. It still passes through via looseObject if
// written by hand. The legacy `use_gateway` boolean is no longer typed
// here (upstream never writes it anymore).
export const ImageGenSchema = z
  .looseObject({
    provider: z
      .string()
      .optional()
      .describe(
        "Image-gen provider selection key: fal, openai, xai, krea, " +
          "openrouter, ... The stored selection always wins over env keys."
      ),
    model: z.string().optional().describe("FAL.ai model id (default fal-ai/flux-2/klein/9b)."),
    max_parallel_requests: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Concurrent images per tool-call batch (default 4)."),
  })
  .optional()
  .describe("Image generation configuration. Requires FAL_KEY.");

export type ImageGen = z.infer<typeof ImageGenSchema>;