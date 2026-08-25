---
title: Messaging platforms
description: Connect an agent to Slack, Discord, Teams, webhooks, or an OpenAI-compatible API server.
sidebar_label: Messaging platforms
sidebar_position: 4
displayed_sidebar: docsSidebar
---

# Messaging platforms

Messaging platforms are how you and your team talk to an agent. Hermeum supports five
platforms that are a good fit for team agents:

| Platform | How it works |
|----------|--------------|
| **API server** | OpenAI-compatible HTTP endpoint — connect any compatible frontend. |
| **Webhook** | HTTP server that accepts signed webhooks and routes them to the agent. |
| **Slack** | Slack bot via Socket Mode (WebSocket — no public endpoint needed). |
| **Discord** | Discord bot via the Gateway WebSocket. |
| **Teams** | Microsoft Teams bot via an HTTPS webhook. |

You enable platforms in the agent's config or through environment variables. The AI
config generator can set them up for you — just mention the platform in your description.

Hermes agent supports additional messaging platforms beyond these. See the
[messaging overview](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/)
for the full list.

## API server

The API server exposes the agent as an **OpenAI-compatible HTTP endpoint**. Any frontend
that speaks the OpenAI format can connect and use the agent as a backend with its full
toolset.

**Required env vars:**

| Variable | Description |
|----------|-------------|
| `API_SERVER_ENABLED` | Set to `true` to enable. |
| `API_SERVER_KEY` | Bearer token for auth. |

For the full configuration reference, see the
[API server guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server).

## Webhook

The webhook platform runs an HTTP server that accepts **HMAC-signed webhooks**,
transforms payloads into agent prompts, and routes responses to a delivery target
(Slack, Discord, GitHub comments, and more).

**Required config:**

| Field | Description |
|-------|-------------|
| `platforms.webhook.enabled` | Set to `true` to enable. |

**Required env vars:**

| Variable | Description |
|----------|-------------|
| `WEBHOOK_SECRET` | HMAC secret used to validate incoming webhooks. |

For the full route and delivery-target reference, see the
[webhook configuration guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks).

## Slack

The agent connects to Slack via **Socket Mode** (a WebSocket — no public HTTP endpoint
needed). You'll need to create a Slack app first; follow the official
[Slack setup guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack)
to get the bot token and app-level token.

**Required env vars:**

| Variable | Description |
|----------|-------------|
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-...`). Sensitive. |
| `SLACK_APP_TOKEN` | App-level token for Socket Mode (`xapp-...`). Sensitive. |
| `SLACK_ALLOWED_USERS` | Comma-separated Slack member IDs allowed to talk to the agent. |

## Discord

The agent connects to Discord via the **Gateway WebSocket**. You'll need to create a
Discord application and invite the bot to your server; follow the official
[Discord setup guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord).

**Required env vars:**

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Bot token from the Discord Developer Portal. Sensitive. |

## Teams

The agent acts as a **Microsoft Teams bot**, receiving messages via an HTTPS webhook at
`/api/messages`. Unlike Slack, Teams requires a publicly reachable endpoint. You'll need
to register the bot in Azure first; follow the official
[Teams setup guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/teams).

**Required env vars:**

| Variable | Description |
|----------|-------------|
| `TEAMS_CLIENT_ID` | Azure AD App (client) ID. |
| `TEAMS_CLIENT_SECRET` | Azure AD client secret. Sensitive. |
| `TEAMS_TENANT_ID` | Azure AD tenant ID. |

