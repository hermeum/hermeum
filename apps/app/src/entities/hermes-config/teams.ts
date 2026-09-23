import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams
// Full field semantics: docs/official/teams.md
// Behavioral settings and non-secret credentials (client_id, tenant_id)
// live here as plain config strings; Teams reads them env-first, so the
// literal config values work. client_secret is env-only by Hermeum policy
// (the reserved, sensitive TEAMS_CLIENT_SECRET env entry) and is not
// typed — it is never written into config.yaml.
export const TeamsSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the Teams bot is enabled."),
    extra: z
      .looseObject({
        client_id: z.string().optional().describe("Azure AD App (client) ID."),
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
    "Microsoft Teams platform configuration. client_secret is env-only " +
      "(TEAMS_CLIENT_SECRET, sensitive); client_id/tenant_id may come from " +
      "config here or from the matching TEAMS_* env var."
  );

export type Teams = z.infer<typeof TeamsSchema>;