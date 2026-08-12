import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams
// Full field semantics: docs/hermes-config/teams.md
// Only behavioral settings live here — credentials (client_id, client_secret,
// tenant_id) are env-only (TEAMS_*) and must not be written into config.yaml.
export const TeamsSchema = z
  .looseObject({
    enabled: z.boolean().optional().describe("Whether the Teams bot is enabled."),
    extra: z
      .looseObject({
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
  .describe("Microsoft Teams platform configuration. Requires TEAMS_* env vars.");

export type Teams = z.infer<typeof TeamsSchema>;