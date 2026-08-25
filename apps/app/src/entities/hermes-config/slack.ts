import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack
// Full field semantics: docs/hermes-config/slack.md
// Only the essential fields are validated here; the rest pass through via
// looseObject so users can configure whatever the Hermes agent supports.
export const ChannelSkillBindingSchema = z
  .object({
    id: z.string().describe("Slack channel/DM ID the binding matches."),
    skills: z
      .array(z.string())
      .optional()
      .describe("Skill names to auto-load for this channel, in order."),
    skill: z
      .string()
      .optional()
      .describe("Single skill to auto-load (short form; exclusive with `skills`)."),
  })
  .describe("A per-channel skill binding for the Slack adapter.");

export type ChannelSkillBinding = z.infer<typeof ChannelSkillBindingSchema>;

export const SlackSchema = z
  .looseObject({
    allowed_channels: z
      .array(z.string())
      .optional()
      .describe("Slack channel IDs the bot may respond in."),
    allow_bots: z
      .enum(["none", "mentions", "all"])
      .optional()
      .describe("Allow other bots to trigger this bot: 'none' (default), 'mentions', or 'all'."),
    channel_prompts: z
      .record(z.string(), z.string())
      .optional()
      .describe("Per-channel ephemeral system prompts, keyed by channel ID."),
    channel_skill_bindings: z
      .array(ChannelSkillBindingSchema)
      .optional()
      .describe("Skills to auto-load at session start per channel/DM."),
    free_response_channels: z
      .array(z.string())
      .optional()
      .describe("Channel IDs where the bot responds without @mention."),
    reactions: z
      .boolean()
      .optional()
      .describe("Emit reactions on receipt/completion (default true)."),
    require_mention: z
      .boolean()
      .optional()
      .describe("Require @mention in channels (default true). DMs always respond."),
    strict_mention: z
      .boolean()
      .optional()
      .describe("Only reply to explicit @mentions; disable auto-engage (default false)."),
    unauthorized_dm_behavior: z
      .literal("ignore")
      .default("ignore")
      .optional()
      .describe("Behavior for unauthorized DMs."),
  })
  .optional()
  .describe("Slack platform configuration. Requires SLACK_* env vars.");

export type Slack = z.infer<typeof SlackSchema>;