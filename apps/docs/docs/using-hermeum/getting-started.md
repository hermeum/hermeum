---
title: Getting started
description: Create your first agent — a daily standup summarizer.
sidebar_label: Getting started
sidebar_position: 1
displayed_sidebar: docsSidebar
---

# Getting started

In this guide you'll create your first Hermeum agent: a **daily standup summarizer**.
Every weekday at 9am it summarizes yesterday's GitHub commits and open PRs and posts a
standup-ready digest to Slack.

You don't need to be a Hermes expert — you can describe what you want in plain language
and Hermeum will generate the configuration for you.

## Before you start

- You can sign in to a running Hermeum instance.
- You have a Slack workspace where you can install a Slack app (you'll need a bot token
  and an app-level token). If you're not sure how, follow the
  [Slack setup guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack).
- You have a GitHub personal access token with `repo` scope for reading commits and PRs.

## Step 1 — Create the agent

1. Sign in to Hermeum and open the **Agents** page.
2. Select **New agent**.
3. Describe what you want in the AI config generator chat, for example:

   > Every weekday at 9am, summarize yesterday's GitHub commits and open PRs, and post a
   > standup digest to Slack.

   Hermeum generates the name, soul, full configuration, and the scheduled cron job for
   you.

## Step 2 — Add the Slack secrets

The agent connects to Slack via Socket Mode. If you haven't created a Slack app yet,
follow the official [Slack bot setup guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack)
to get the bot token and app-level token, then add the following credentials as
environment variables on the agent. In the agent's **Env** section, add each with
**sensitive** toggled on where noted:

| Name | Value | Sensitive |
|------|-------|-----------|
| `SLACK_BOT_TOKEN` | `xoxb-...` | yes |
| `SLACK_APP_TOKEN` | `xapp-...` | yes |
| `SLACK_ALLOWED_USERS` | `U01ABC2DEF3` | no |
| `SLACK_HOME_CHANNEL` | `C0123456789` | no |

What these do:

- **`SLACK_BOT_TOKEN`** / **`SLACK_APP_TOKEN`** — the credentials Slack generated when
  you created the app. The bot token (`xoxb-...`) lets the agent post messages; the
  app-level token (`xapp-...`, scope `connections:write`) opens the Socket Mode
  WebSocket connection.
- **`SLACK_ALLOWED_USERS`** — comma-separated Slack member IDs allowed to talk to the
  agent. Without it, the agent denies all messages by default.
- **`SLACK_HOME_CHANNEL`** — the channel ID the cron job posts the digest to. Channel IDs
  start with `C`; look them up in Slack under channel details → **About**.

## Step 3 — Add the GitHub token

The agent reads commits and pull requests from GitHub using the `gh` CLI. In the agent's
**Env** section, add your GitHub token with **sensitive** toggled on:

| Name | Value | Sensitive |
|------|-------|-----------|
| `GITHUB_TOKEN` | `ghp_...` | yes |

The `gh` CLI reads `GITHUB_TOKEN` automatically, but Hermeum filters this env var out
of the agent's runtime for security reasons, so the agent can't use it directly. You
need to ask the agent to sign in manually by reading the token from the `.env` file.

Once the agent is running, send it a message:

> install `gh` command at /opt/data/.local/bin and sign in with a token stored at .env file.

This authenticates the `gh` CLI by reading `GITHUB_TOKEN` from `.env`, so the cron job
can pull repository activity on the next run.

## Step 4 — Save and start the agent

Select **Create**. Hermeum provisions the agent, connects to Slack, and schedules the
standup cron. The agent's page shows its status as **Running** and lists its connected
platforms.

## Step 5 — Verify the schedule

Ask the agent to confirm the cron is scheduled, for example:

> Is the daily standup cron scheduled?

You can also trigger it once to test the output before the next 9am:

> Run the daily standup cron now.

The digest will be posted to your `SLACK_HOME_CHANNEL`. Check Slack to confirm it
arrived.

## Where to go next

- [Creating an agent](../creating-an-agent) — the full agent model: soul, config, env,
  skills, crons, and lifecycle.
- [Messaging platforms](../messaging-platforms) — connect agents to Discord, Microsoft
  Teams, webhooks, or the OpenAI-compatible API server.
- [Skills](../skills) — add more capabilities to your agent, such as reading project
  trackers or filtering by repository.