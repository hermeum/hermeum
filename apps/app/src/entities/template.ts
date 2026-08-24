import { z } from "zod";

import { AgentInputSchema } from "./agent";

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  agentInput: AgentInputSchema,
}).readonly();

export type Template = z.infer<typeof TemplateSchema>;
