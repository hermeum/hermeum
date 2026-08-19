---
name: discord
category: platforms
description: Discord platform configuration (`discord`) — mention gating, auto-threading, channel allow/ignore lists, per-channel prompts, and DISCORD_BOT_TOKEN env var.
---

# Discord configuration (`config.discord`)

Configures the Discord gateway adapter, which connects to Discord via
the Gateway WebSocket and relays messages between server channels/DMs
and the Hermes agent. Requires the `DISCORD_BOT_TOKEN` env var.

**You must configure Discord on the Discord side before this gateway
will work** — application creation, bot token, privileged gateway
intents (Server Members + Message Content), and server invite. Complete
that setup by following the official Hermes Agent guide at
https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord.

Most `discord.*` fields have a `DISCORD_*` env var mirror (e.g.
`discord.require_mention` ↔ `DISCORD_REQUIRE_MENTION`); env vars
override `config.yaml` when both are set.

## Fields

- `require_mention` — require `@mention` in server channels (default
  `true`). DMs always respond regardless.
- `thread_require_mention` — require `@mention` in threads too, for
  multi-bot setups where every bot would otherwise fire on every
  message (default `false`).
- `auto_thread` — auto-create a thread per `@mention` in text channels
  (default `true`). Channels in `free_response_channels` or
  `no_thread_channels` bypass threading.
- `reactions` — add emoji reactions during processing (👀 on start, ✅
  on success, ❌ on error). Default `true`.
- `free_response_channels` — channel IDs where the bot responds without
  `@mention` (e.g. a dedicated bot channel). Skips auto-threading.
- `ignored_channels` — channel IDs where the bot **never** responds,
  even when `@mentioned`. Highest priority.
- `no_thread_channels` — channel IDs where the bot replies inline
  instead of auto-creating a thread. Only relevant when `auto_thread`
  is `true`.
- `channel_prompts` — per-channel ephemeral system prompts, keyed by
  channel ID. Injected on every turn, not persisted to transcript.
  Threads inherit the parent channel's prompt.
- `allow_mentions` — what the bot is allowed to ping. Sub-fields:
  `everyone` (default `false`), `roles` (default `false`), `users`
  (default `true`), `replied_user` (default `true`).

Additional knobs (`history_backfill`, `history_backfill_limit`,
`voice_fx`, `missed_message_backfill`, etc.) pass through unchanged
via `looseObject`; see the official guide for their semantics.

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal. Required. | _(required)_ |
| `DISCORD_ALLOWED_USERS` | Comma-separated Discord user IDs allowed to interact. Without this **or** `DISCORD_ALLOWED_ROLES`, the gateway denies all users unless `DISCORD_ALLOW_ALL_USERS=true`. | _(conditional)_ |
| `DISCORD_ALLOWED_ROLES` | Comma-separated Discord role IDs; members with any listed role are authorized (OR with `DISCORD_ALLOWED_USERS`). | _(none)_ |
| `DISCORD_ALLOW_ALL_USERS` | Allow any Discord user to trigger the bot (trusted/private guilds only). | `false` |
| `DISCORD_HOME_CHANNEL` | Channel ID for proactive messages (cron output, reminders). | _(none)_ |
| `DISCORD_HOME_CHANNEL_NAME` | Display name for the home channel. | _(none)_ |

`DISCORD_BOT_TOKEN` is a credential — set it via the `env:` block with
`sensitive: true`, not in `config.yaml`.

## Example

```yaml
config:
  discord:
    require_mention: true
    auto_thread: true
    free_response_channels:
      - "123456789012345678"
    ignored_channels:
      - "987654321098765432"
    channel_prompts:
      "123456789012345678": |
        This is a research channel. Prefer citations and concise synthesis.
    allow_mentions:
      everyone: false
      roles: false
      users: true
env:
  - name: DISCORD_BOT_TOKEN
    value: your-bot-token-here
    sensitive: true
  - name: DISCORD_ALLOWED_USERS
    value: "284102345871466496"
```