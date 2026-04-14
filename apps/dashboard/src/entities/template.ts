import { z } from "zod";

import { InstanceInputSchema } from "./instance";

export const TemplateSchema = InstanceInputSchema.extend({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
}).readonly();

export type Template = z.infer<typeof TemplateSchema>;
