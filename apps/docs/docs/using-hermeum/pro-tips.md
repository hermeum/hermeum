---
title: Pro tips
description: Practical recipes for working with agents — authenticating with GitHub and X.
sidebar_label: Pro tips
sidebar_position: 7
displayed_sidebar: docsSidebar
---

# Pro tips

This page collects practical recipes for getting more out of Hermeum agents. Each tip is
something you ask a running agent to do — copy the example messages and adapt them to
your setup.

## Authorize an agent with GitHub

Agents can work with GitHub through the `gh` CLI, but the CLI needs to be authenticated
first. The trick is to store the token as an environment variable and let the agent read
it from its `.env` file.

1. In the agent's **Env** section, add your GitHub personal access token with
   **sensitive** toggled on:

   | Name | Value | Sensitive |
   |------|-------|-----------|
   | `GITHUB_TOKEN` | `ghp_...` | yes |

2. Send the agent a message:

   > install `gh` command at /opt/data/.local/bin and sign in with the token stored in the .env file using `gh auth login --with-token`.

The agent reads `GITHUB_TOKEN` from the `.env` file and authenticates the `gh` CLI with
`gh auth login --with-token`. From then on, it can read commits, pull requests, and
issues on your behalf.

:::note
Hermeum filters `GITHUB_TOKEN` out of the agent's runtime environment for security
reasons, so the CLI can't pick it up automatically — the agent has to read it from the
`.env` file explicitly.
:::

## Authorize an agent with X

Agents can work with X through the [`xurl`](https://github.com/xdevplatform/xurl) CLI.
Since X uses OAuth, there is no static token to store up front — instead the agent
registers your X developer app and then runs a headless OAuth flow, handing the browser
step to you.

1. Create an app in the [X developer portal](https://developer.x.com/en/portal/dashboard),
   set its redirect URI to `http://localhost:8080/callback`, and copy the Client ID and
   Client Secret.

2. In the agent's **Env** section, add both values with **sensitive** toggled on:

   | Name | Value | Sensitive |
   |------|-------|-----------|
   | `XURL_CLIENT_ID` | `...` | yes |
   | `XURL_CLIENT_SECRET` | `...` | yes |

3. Send the agent a message:

   > install `xurl`, register an app with the client credentials stored in the .env file using `xurl auth apps add`, and sign in to X with `xurl auth oauth2 --headless`.

4. The agent reads `XURL_CLIENT_ID` and `XURL_CLIENT_SECRET` from the `.env` file,
   registers the app, and replies with an authorization URL. Open that URL in your
   browser and approve the access request.

5. After you approve, the browser redirects to a `localhost` URL. Copy the full
   redirected URL from the browser's address bar and paste it back to the agent.

The agent completes the OAuth exchange with the redirected URL and saves the resulting
credentials. From then on, it can read and post to X on your behalf.

:::tip
The redirected URL starts with `localhost` and looks like an error page — that's
expected. The agent only needs it for the authorization code it contains.
:::

## Next steps

- [Getting started](../getting-started) — see the GitHub token flow in a full walkthrough.
- [Creating an agent](../creating-an-agent) — the full agent model, including env.