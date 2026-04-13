import { z } from "zod";

import { TemplateSchema } from "./template";

export const InitConfigSchema = z.object({
  templates: z.array(TemplateSchema),
  allowedConfigPaths: z.array(z.string()).optional(),
  allowedSkills: z.array(z.string()).optional(),
  allowedWorkspaceFiles: z.array(z.string()).optional(),
});

export type InitConfig = z.infer<typeof InitConfigSchema>;
