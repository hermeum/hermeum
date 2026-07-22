import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack
// Only the essential fields are validated here; the rest pass through via
// looseObject so users can configure whatever the Hermes agent supports.
// There is no docs/hermes-config/slack.md yet; field semantics are inline.
export const SlackSchema = z
  .looseObject({
    allowed_channels: z
      .array(z.string())
      .optional()
      .describe("Slack channel IDs the bot may respond in."),
    unauthorized_dm_behavior: z
      .literal("ignore")
      .default("ignore")
      .optional()
      .describe('Behavior for unauthorized DMs. Always "ignore".'),
  })
  .optional()
  .describe("Slack platform configuration. Requires SLACK_* env vars.");

export type Slack = z.infer<typeof SlackSchema>;