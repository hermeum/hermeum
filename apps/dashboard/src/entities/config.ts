import { z } from "zod";

import { TemplateSchema } from "./template";

export const InitConfigSchema = z
  .object({
    templates: z.array(TemplateSchema),
    allowed: z
      .object({
        openClawJsonPaths: z.array(z.string()).optional(),
        skills: z.array(z.string()).optional(),
        workspaceFiles: z.array(z.string()).optional(),
        plugins: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .readonly();

export type InitConfig = z.infer<typeof InitConfigSchema>;
