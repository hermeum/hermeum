import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/image-generation
// Full field semantics: docs/hermes-config/image-gen.md
export const ImageGenSchema = z
  .looseObject({
    model: z.string().optional().describe("FAL.ai model id (default fal-ai/flux-2/klein/9b)."),
    use_gateway: z
      .boolean()
      .optional()
      .describe("Use the managed Nous Subscription gateway instead of a direct FAL_KEY."),
    max_parallel_requests: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Concurrent images per tool-call batch (default 4)."),
  })
  .optional()
  .describe("Image generation configuration. Requires FAL_KEY or the managed gateway.");

export type ImageGen = z.infer<typeof ImageGenSchema>;