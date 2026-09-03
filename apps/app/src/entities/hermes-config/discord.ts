import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord
// Full field semantics: docs/hermes-config/discord.md
// Only the essential fields are validated here; the rest pass through via
// looseObject so users can configure whatever the Hermes agent supports.
//
// Skipped on purpose: discord.missed_message_backfill and the
// websocket_liveness_interval_seconds / websocket_liveness_failure_threshold /
// websocket_heartbeat_ack_max_age_seconds / websocket_max_latency_seconds
// liveness knobs are not typed here — they pass through via looseObject.
export const DiscordSchema = z
  .looseObject({
    require_mention: z
      .boolean()
      .optional()
      .describe("Require @mention in server channels (default true). DMs always respond."),
    thread_require_mention: z
      .boolean()
      .optional()
      .describe("Require @mention in threads too — for multi-bot setups (default false)."),
    auto_thread: z
      .boolean()
      .optional()
      .describe("Auto-create a thread per @mention in text channels (default true)."),
    reactions: z
      .boolean()
      .optional()
      .describe("Add emoji reactions during processing (default true)."),
    free_response_channels: z
      .array(z.string())
      .optional()
      .describe("Channel IDs where the bot responds without @mention."),
    ignored_channels: z
      .array(z.string())
      .optional()
      .describe("Channel IDs where the bot never responds, even when @mentioned."),
    no_thread_channels: z
      .array(z.string())
      .optional()
      .describe("Channel IDs where the bot replies inline instead of auto-threading."),
    channel_prompts: z
      .record(z.string(), z.string())
      .optional()
      .describe("Per-channel ephemeral system prompts, keyed by channel ID."),
    allow_mentions: z
      .looseObject({
        everyone: z.boolean().optional().describe("Allow @everyone / @here pings (default false)."),
        roles: z.boolean().optional().describe("Allow @role pings (default false)."),
        users: z.boolean().optional().describe("Allow @user pings (default true)."),
        replied_user: z
          .boolean()
          .optional()
          .describe("Reply-reference pings the original author (default true)."),
      })
      .optional()
      .describe("What the bot is allowed to ping."),
  })
  .optional()
  .describe("Discord platform configuration. Requires DISCORD_BOT_TOKEN env var.");

export type Discord = z.infer<typeof DiscordSchema>;