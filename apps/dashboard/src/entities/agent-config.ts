import { z } from "zod";

import { TemplateSchema } from "./template";

export const JsonPatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

export type JsonPatchOp = z.infer<typeof JsonPatchOpSchema>;

export const AgentTypeSchema = z.object({
  mutatingWebhookJsonPatch: z.array(JsonPatchOpSchema),
});

export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AgentConfigSchema = z
  .object({
    agentTypes: z.record(z.string(), AgentTypeSchema).optional(),
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

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export type WebhookVariables = {
  agentId: string;
  userId: string;
  agentName: string;
  agentDescription: string;
  agentType: string;
};
