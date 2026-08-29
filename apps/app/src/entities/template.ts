import { z } from "zod";

import { AgentInputObjectSchema } from "./agent";

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  // Use the base object schema (no superRefine) so operator-authored templates
  // may carry `<fill-me>` placeholders without failing config load. The strict
  // AgentInputSchema is re-applied at agent creation/update boundaries.
  agentInput: AgentInputObjectSchema,
}).readonly();

export type Template = z.infer<typeof TemplateSchema>;
