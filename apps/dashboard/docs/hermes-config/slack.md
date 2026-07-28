---
name: slack
category: platforms
description: Slack platform configuration (`slack` and `platforms.slack`) — channel allowlist, mention gating, per-channel prompts, per-channel skill bindings, and env vars.
---

# Slack configuration

Configures the Slack gateway adapter, which connects to Slack via
`slack-bolt` in Socket Mode (WebSocket — no public HTTP endpoint required)
and relays messages between Slack channels/DMs and the Hermes agent.
Requires `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, and `SLACK_ALLOWED_USERS`
env vars (see [Environment variables](#environment-variables)); without
`SLACK_ALLOWED_USERS` the gateway denies all messages by default.

Slack config lives in **two** `config.yaml` locations — keep them
straight, they are not interchangeable:

- **`slack:`** (top-level) — behavior knobs: channel allowlist, mention
  gating, per-channel prompts, per-channel skill bindings,
  `require_mention`, `strict_mention`, `free_response_channels`,
  `reactions`, `mention_patterns`, `reply_prefix`, `reply_to_mode`,
  `unauthorized_dm_behavior`. See [Fields (`slack:`)](#fields-slack).
- **`platforms.slack:`** (nested) — adapter/wiring knobs, with
  per-message-rendering settings under its `extra:` sub-map. See
  [Fields (`platforms.slack:`)](#fields-platformsslack).

Channel IDs start with `C` (public channel), `G` (private channel / MPIM),
or `D` (1:1 DM). Look them up via the Slack UI's channel details → "About"
panel, or via the Slack API.

## Fields (`slack:`)

Top-level `slack:` block — behavior knobs.

- `allowed_channels` — list of Slack channel IDs the bot may respond in.
  When set, messages from channels **not** in this list are silently
  ignored, even if the bot is `@mentioned`. 1:1 DMs are exempt; group DMs
  (MPIMs, IDs starting with `G`) are **not** exempt and must be on the
  list. Empty/unset → no restriction. Also settable via
  `SLACK_ALLOWED_CHANNELS` (comma-separated).
- `unauthorized_dm_behavior` — behavior when an unauthorized user (not in
  `SLACK_ALLOWED_USERS`) DMs the bot. `"pair"` prompts them for a pairing
  code (default); `"ignore"` silently drops the message. The
  platform-specific value takes precedence over the global setting.
- `require_mention` — require `@mention` in channels (default `true`).
  The Slack adapter enforces mention gating in channels regardless; set
  explicitly for consistency with other platforms.
- `strict_mention` — when `true`, only reply to channel messages that
  contain an explicit `@mention`. With this off (default), Slack can
  "auto-engage" — remembering past mentions in a thread, following up on
  bot-message replies, and resuming active sessions without a fresh
  mention. DMs and active interactive sessions are unaffected. Also
  settable via `SLACK_STRICT_MENTION`.
- `allow_bots` — allow other bots to trigger this bot (default `false`).
  Also settable via `SLACK_ALLOW_BOTS`.
- `free_response_channels` — channel IDs where the bot responds without
  `@mention` (e.g. dedicated support channels). Comma-separated in
  `SLACK_FREE_RESPONSE_CHANNELS`. Once the bot has an active session in a
  thread, subsequent thread replies don't require a mention regardless.
- `reactions` — emit `:eyes:`/`:white_check_mark:` reactions on receipt
  / completion (default `true`). Also settable via `SLACK_REACTIONS`.
- `mention_patterns` — custom substrings that trigger the bot in
  addition to the default `@mention` detection (e.g. `["hey hermes",
  "hermes,"]`).
- `reply_prefix` — text prepended to every outgoing message (default
  `""`).
- `reply_to_mode` — threading mode for multi-part messages: `"off"`
  (never thread to the original message), `"first"` (first chunk threads
  to the user's message — default), `"all"` (all chunks thread).
- `channel_prompts` — see [Per-Channel Prompts](#per-channel-prompts).
- `channel_skill_bindings` — see
  [Per-Channel Skill Bindings](#per-channel-skill-bindings).

## Fields (`platforms.slack:`)

Nested `platforms.slack:` block — adapter/wiring knobs. The
per-message-rendering settings live under its `extra:` sub-map.

- `platforms.slack.reply_to_mode` — threading mode (same values as the
  top-level `slack.reply_to_mode`; the nested form is the canonical one
  the adapter reads).
- `platforms.slack.extra.reply_in_thread` — reply in a thread attached
  to the triggering message (default `true`). When `false`, channel
  messages get direct channel replies; messages inside existing threads
  still reply in-thread.
- `platforms.slack.extra.reply_broadcast` — also post thread replies to
  the main channel (Slack's "Also send to channel" feature). Only the
  first chunk of the first reply is broadcast (default `false`).
- `platforms.slack.extra.rich_blocks` — render agent messages as Slack
  Block Kit blocks (headers, dividers, true nested lists via
  `rich_text`, native tables) instead of flat mrkdwn text (default
  `false`). A plain-text fallback is always sent alongside; tables over
  Slack's limits (100 rows / 20 cols / 10k chars) fall back to aligned
  monospace. Send-side only — no app reinstall required.
- `platforms.slack.extra.cron_continuable_surface` — delivery surface
  for continuable cron jobs: `"thread"` (default; opens a dedicated
  thread per delivery) or `"in_channel"` (delivers flat into the channel
  timeline). Pair `in_channel` with `reply_in_thread: false` (and
  `require_mention: false`) so a plain channel reply continues the job.

## Per-Channel Prompts

Per-channel ephemeral system prompts, keyed by Slack channel ID. Injected
at runtime on **every turn** — not persisted to transcript, so changes take
effect immediately. Threads inherit the parent channel's prompt; blank
prompts are treated as absent. Lives under the top-level `slack:` block.

```yaml
slack:
  channel_prompts:
    "C01RESEARCH": |
      You are a research assistant. Focus on academic sources,
      citations, and concise synthesis.
```

## Per-Channel Skill Bindings

Auto-load skills at **session start** in a specific channel/DM (injected as
a user message into history, not reloaded each turn). Threads inherit the
parent channel's binding; run `/new` to apply changes. Each entry is
`{ id, skills }` or the single-string shortcut `{ id, skill }`. Lives under
the top-level `slack:` block.

```yaml
slack:
  channel_skill_bindings:
    - id: "D0ATH9TQ0G6"
      skills: [german-flashcards]
    - id: "C01RESEARCH"
      skills: [arxiv, writing-plans]
    - id: "C02SUPPORT"
      skill: hubspot-on-demand   # single-string shortcut
```

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-...`). Required. Multiple workspaces supported as a comma-separated list. | _(required)_ |
| `SLACK_APP_TOKEN` | Slack app-level token for Socket Mode (`xapp-...`, scope `connections:write`). Required. | _(required)_ |
| `SLACK_ALLOWED_USERS` | Comma-separated Slack member IDs allowed to talk to the bot. **Required** — without it, the gateway denies all messages by default. | _(required)_ |
| `SLACK_ALLOW_ALL_USERS` | Allow any Slack user to trigger the bot (dev only). | `false` |
| `SLACK_HOME_CHANNEL` | Default channel ID for cron / scheduled-message delivery (starts with `C`). | _(none)_ |
| `SLACK_HOME_CHANNEL_NAME` | Display name for the Slack home channel. | _(none)_ |
| `SLACK_ALLOWED_CHANNELS` | Comma-separated channel IDs the bot may respond in (env mirror of `slack.allowed_channels`). | _(none)_ |
| `SLACK_FREE_RESPONSE_CHANNELS` | Comma-separated channel IDs where the bot responds without `@mention` (env mirror of `slack.free_response_channels`). | _(none)_ |
| `SLACK_REQUIRE_MENTION` | Env mirror of `slack.require_mention`. | `true` |
| `SLACK_STRICT_MENTION` | Env mirror of `slack.strict_mention`. | `false` |
| `SLACK_ALLOW_BOTS` | Env mirror of `slack.allow_bots`. | `false` |
| `SLACK_REACTIONS` | Env mirror of `slack.reactions`. | `true` |

`SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are credentials — set them via
the `env:` block with `sensitive: true`, not in `config.yaml`, to avoid
exposing them in plain text.

## Example

### Both `slack:` and `platforms.slack:` blocks

The top-level `slack:` block holds behavior knobs (allowlist, per-channel
prompts/skills); the nested `platforms.slack:` block holds adapter/wiring
knobs under `extra:`.

```yaml
config:
  # Top-level — behavior knobs + per-channel features
  slack:
    allowed_channels:
      - "C0123456789"   # #ops
      - "C01RESEARCH"   # #research
    unauthorized_dm_behavior: "ignore"
    channel_prompts:
      "C01RESEARCH": |
        You are a research assistant. Focus on academic sources,
        citations, and concise synthesis.
    channel_skill_bindings:
      - id: "D0ATH9TQ0G6"
        skills: [german-flashcards]
      - id: "C01RESEARCH"
        skills: [arxiv, writing-plans]
env:
  - name: SLACK_BOT_TOKEN
    value: xoxb-your-bot-token-here
    sensitive: true
  - name: SLACK_APP_TOKEN
    value: xapp-your-app-token-here
    sensitive: true
  - name: SLACK_ALLOWED_USERS
    value: U01ABC2DEF3
```