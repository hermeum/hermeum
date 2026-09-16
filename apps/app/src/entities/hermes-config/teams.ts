import { z } from "zod";

import { SecretRefSchema } from "./shared";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams
// Full field semantics: docs/hermes-config/teams.md
// Behavioral settings and credentials live here. client_secret is typed as
// a ${VAR} reference (actual value in the sensitive TEAMS_CLIENT_SECRET env
// entry, substituted by hermes at config load).
export const TeamsSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the Teams bot is enabled."),
    extra: z
      .looseObject({
        client_id: z.string().optional().describe("Azure AD App (client) ID."),
        client_secret: SecretRefSchema.optional().describe(
          "Azure AD client secret, as an env var reference."
        ),
        tenant_id: z.string().optional().describe("Azure AD tenant ID."),
        port: z
          .number()
          .int()
          .optional()
          .describe("Webhook port. Falls back to TEAMS_PORT env var (default 3978)."),
      })
      .optional()
      .describe("Teams bot settings."),
  })
  .optional()
  .describe(
    "Microsoft Teams platform configuration. client_secret is set as a " +
      "${TEAMS_CLIENT_SECRET} reference; the secret value lives in the sensitive env entry."
  );

export type Teams = z.infer<typeof TeamsSchema>;