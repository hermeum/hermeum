import { z } from "zod";

import { TemplateSchema } from "./template";

export const InitConfigSchema = z.object({
  templates: z.array(TemplateSchema),
});

export type InitConfig = z.infer<typeof InitConfigSchema>;
