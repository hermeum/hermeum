---
title: Getting started
description: Create your first agent — a GitHub pull-request code reviewer.
sidebar_label: Getting started
sidebar_position: 1
displayed_sidebar: docsSidebar
---

# Getting started

In this guide you'll create your first Hermeum agent: a **code reviewer**. It watches for
pull-request review requests and posts its review back to GitHub from its own account.

You don't need to be a Hermes expert — you can describe what you want in plain language
and Hermeum will generate the configuration for you.

<video controls width="100%">
  <source src="https://hermeum.github.io/assets/code-reviewer-demo.mp4" type="video/mp4" />
  Your browser does not support the video tag.
</video>

## Before you start

- You can sign in to a running Hermeum instance.
- Create a dedicated **GitHub account for the agent**. It posts the reviews, so comments
  appear under this identity rather than yours.
- Create a **personal access token (classic)** on that account with the **`repo`** and
  **`read:org`** scopes.

## Step 1 — Create the agent

1. Sign in to Hermeum and open the **Agents** page.
2. Select **New agent**.
3. Describe what you want in the AI config generator chat, for example:

   > Conduct code review on pull requests when you have received a review request.

   Hermeum generates the name, soul, configuration, and the webhook route that receives
   GitHub's `pull_request` events for you.

## Step 2 — Add the webhook secret and token

The agent needs the webhook platform enabled plus two secrets: the shared secret GitHub
signs its webhook requests with, and the token the `gh` CLI uses to post reviews. In the
agent's **Env** section, make sure these entries are present (fill in the two values):

| Name              | Value                                 | Sensitive |
| ----------------- | ------------------------------------- | --------- |
| `WEBHOOK_ENABLED` | `true`                                | no        |
| `WEBHOOK_SECRET`  | a random secret you generate          | yes       |
| `GH_TOKEN`        | `ghp_...` (the personal access token) | yes       |

Generate the webhook secret with any password generator, for example:

```sh
openssl rand -hex 32
```

What these do:

- **`WEBHOOK_ENABLED`** — turns on the agent's webhook listener. The webhook platform is
  enabled through this env var; the config generator wires the route, but enablement is
  env-only.
- **`WEBHOOK_SECRET`** — the shared secret used to verify that incoming requests really
  came from GitHub. You'll paste the same value into GitHub in the next step.
- **`GH_TOKEN`** — the personal access token from **Before you start**. The `gh` CLI reads
  it directly, so it can post review comments without an interactive login.

## Step 3 — Add a GitHub webhook

GitHub needs to know where to send review requests. In the repository, go to
**Settings → Webhooks → Add webhook**, then:

1. **Payload URL** — copy the agent's webhook URL from the **Endpoints** section on its
   page. It looks like `https://<agent-id>.hooks.<base-hostname>/webhooks/<route-name>`,
   where the route name is generated with the agent.
2. **Content type** — `application/json`.
3. **Secret** — the same value as `WEBHOOK_SECRET`.
4. **Which events would you like to trigger this webhook?** — choose **Let me select
   individual events** and select **Pull requests**.
5. Select **Add webhook**.

## Step 4 — Add the GitHub account as a reviewer

For GitHub to request reviews from the agent, the account must be able to review the
repository:

1. Add the agent's GitHub account as a collaborator (or to a team with write access) on
   the repository.
2. Add it as a reviewer on the pull requests you want reviewed — manually, or through a
   `CODEOWNERS` file, a branch-protection rule, or an automation.

## Step 5 — Test it

Open a pull request in the repository and request a review from the agent's account.
GitHub sends a `pull_request` event to the agent, the agent reviews the diff, and the
review appears on the pull request under the agent's GitHub account.

## Where to go next

- [Creating an agent](../creating-an-agent) — the full agent model: soul, config, env,
  skills, crons, and lifecycle.
- [Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills#skills-hub)
  — add more capabilities, such as the `github-code-review` skill.
