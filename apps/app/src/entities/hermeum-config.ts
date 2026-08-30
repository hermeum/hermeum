import { z } from "zod";

import { TemplateSchema } from "./template";
import { AgentTypeKeySchema } from "./agent-type";

export const JsonPatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

export type JsonPatchOp = z.infer<typeof JsonPatchOpSchema>;

/**
 * A JSON Patch is an array of ops. The `test` op acts as a precondition: when
 * a patch begins with `test` ops, the webhook selects it only if all tests
 * pass against the incoming object (first-match-wins), otherwise falls through
 * to the next candidate (no-match = no mutation). A single flat array is the
 * legacy shape (one unconditional candidate); an array of arrays declares
 * multiple candidates evaluated in order.
 */
const JsonPatchArraySchema = z.array(JsonPatchOpSchema);

export const MutatingWebhookJsonPatchSchema = z
  .union([JsonPatchArraySchema, z.array(JsonPatchArraySchema)])
  .transform((v) => (Array.isArray(v[0]) ? (v as JsonPatchOp[][]) : [v as JsonPatchOp[]]));

export type MutatingWebhookJsonPatch = z.infer<typeof MutatingWebhookJsonPatchSchema>;

export const AgentTypeConfigSchema = z.object({
  description: z.string().optional(),
  mutatingWebhookJsonPatch: MutatingWebhookJsonPatchSchema,
});

export type AgentTypeConfig = z.infer<typeof AgentTypeConfigSchema>;

export const HermeumConfigSchema = z
  .object({
    agentTypes: z.record(AgentTypeKeySchema, AgentTypeConfigSchema).optional(),
    templates: z.array(TemplateSchema),
  })
  .superRefine((data, ctx) => {
    for (const [i, template] of data.templates.entries()) {
      if (template.agentInput?.type === undefined) continue;
      if (!data.agentTypes || !(template.agentInput.type in data.agentTypes)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Template "${template.id}" references unknown agentType "${template.agentInput.type}"`,
          path: ["templates", i, "agentInput", "type"],
        });
      }
    }
  })
  .readonly();

export type HermeumConfig = z.infer<typeof HermeumConfigSchema>;
