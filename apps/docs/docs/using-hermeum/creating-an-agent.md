---
title: Creating an agent
description: Define an agent's soul, config, env, skills, plugins, packages, and crons.
sidebar_label: Creating an agent
sidebar_position: 2
displayed_sidebar: docsSidebar
---

# Creating an agent

Every agent in Hermeum is made of the same pieces. This page walks through what each one
does so you know what to tweak — but you don't need to fill them all in by hand. The
easiest way to create an agent is to describe it in plain language and let Hermeum
generate everything for you (see [Getting started](../getting-started) for a full
walkthrough).

## What an agent is made of

| Piece | What it's for |
|-------|---------------|
| **Name** | How you identify the agent in Hermeum. |
| **Soul** | The agent's personality and purpose. |
| **Config** | The agent's settings — model, tools, and integrations. |
| **Env** | Secrets and other environment variables the agent needs. |
| **Skills** | Capabilities you install into the agent. |
| **Plugins** | Extra extensions for the agent runtime. |
| **Packages** | Python and npm libraries the agent or its skills depend on. |
| **Crons** | Scheduled tasks the agent runs automatically. |

## Ways to create an agent

You have two paths:

- **AI config generator** — Open the chat in the **New agent** view and describe what
  you want in plain language. Hermeum drafts the name, soul, config, and any crons for
  you. Best for most users, and the only path that can write the soul for you.
- **Manual editor** — Skip the chat and fill in the fields yourself. Useful when you
  already know the exact configuration you want, or you're porting an agent from
  elsewhere.

Both paths land on the same agent; you can switch between them any time by editing the
agent later.

## Soul

The soul is the first thing in the agent's system prompt. It defines **who the agent
is** — its voice, personality, and posture. It is not for task-specific instructions;
those belong in the config.

```yaml title="Example"
soul: |
  You are a pragmatic senior engineer with strong taste. Be direct without being cold,
  prefer substance over filler, and push back when something is a bad idea.
```

For deeper guidance and more examples, see the
[Personality & soul.md guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality).

## Config

The config is the agent's settings file. It's where you pick the model, turn on
[toolsets](../toolsets) (web, browser, terminal, code execution, and more), wire up
[messaging platforms](../messaging-platforms) (Slack, Discord, Teams, webhooks, or the
OpenAI-compatible API server), and enable integrations like image and video generation.

You don't have to write it by hand — the AI config generator fills it out from your
description, and you can edit it later whenever you need to fine-tune something.

```yaml title="Example"
config:
  model:
    base_url: https://ollama.com/v1
    default: kimi-k3
    provider: ollama-cloud
```

## Env

Env is where you give the agent the secrets and settings it needs to do its job — API
keys, bot tokens, feature flags, and so on. You can add up to 20 environment variables
per agent.

- Toggle **sensitive** on for anything you want treated as a secret (API keys, tokens).
  Hermeum stores the value encrypted and hides it from plain view.
- Use `<fill-me>` as a placeholder when you want the agent created now but the real
  value supplied later (for example, when a teammate has the key).
- `<secret>` is a sentinel Hermeum uses for existing secrets — it's replaced with the
  real value when the agent runs, so you never need to type it.

```yaml title="Example"
env:
  - name: OPENAI_API_KEY
    value: sk-proj-XXXXX
    sensitive: true
  - name: LOG_LEVEL
    value: debug
```

## Skills, plugins, and packages

### Skills

Skills add capabilities to an agent — for example, `github-code-review` to read diffs
and review pull requests. You can install skills from community hubs, GitHub paths, or
direct URLs. See the [Skills Hub guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills#skills-hub)
for the details.

```yaml title="Example"
skills:
  - openai/skills/k8s
  - official/security/1password
  - https://sharethis.chat/SKILL.md
```

### Plugins

Plugins extend the agent runtime itself. You can add up to 20 plugin identifiers per
agent, in the `<owner>/<repo>` format.

### Packages

Packages are Python (`pip`) and JavaScript (`npm`) libraries you pre-install so the
agent or its skills can use them. You can add up to 50 of each. Install them with
standard specifiers, for example `pandas==2.1.0` or `@anthropic-ai/sdk@^1.0.0`.

```yaml title="Example"
packages:
  pip:
    - requests
    - pandas==2.1.0
  npm:
    - "@anthropic-ai/sdk@^1.0.0"
    - typescript
```

## Crons

Crons are scheduled tasks the agent runs on its own. Each cron has a name, a schedule,
a prompt to run, and a delivery target for the output.

Schedules can be:

- a **relative delay** (one-shot) — `30m`, `2h`, `1d`
- an **interval** (recurring) — `every 30m`, `every 2h`, `every 1d`
- a **cron expression** — `0 9 * * *` (daily at 9am), `0 */6 * * *` (every 6 hours)
- an **ISO timestamp** (one-time) — `2026-03-15T09:00:00`

The output of a cron can be delivered to any connected platform — Slack, Discord,
email, and more.

```yaml title="Example"
crons:
  - name: daily-standup
    schedule: "0 9 * * *"
    prompt: |
      Summarize yesterday's GitHub commits and open PRs, then post a
      standup-ready digest.
    deliver: slack
```

## Next steps

- [Toolsets](../toolsets) — the built-in capabilities an agent can use.
- [Messaging platforms](../messaging-platforms) — connect an agent to Slack, Discord,
  Teams, webhooks, or the OpenAI-compatible API server.
- [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills#skills-hub)
  — install capabilities from community hubs, GitHub, or direct URLs.