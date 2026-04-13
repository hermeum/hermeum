import { z } from "zod";

import { InstanceInputSchema } from "./instance";

export const TemplateSchema = InstanceInputSchema.extend({
  id: z.string(),
  name: z.string(),
});

export type Template = z.infer<typeof TemplateSchema>;
