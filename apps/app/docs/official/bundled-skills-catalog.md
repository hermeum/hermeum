---
name: bundled-skills-catalog
category: reference
description: Bundled skills catalog — the skills installed by default with hermes-agent; name, path, description, and env vars for each.
---

<!-- Mirrors vendor/hermes-agent skills (bundled set) at the pinned submodule
     version; the pointer implies the version. Source of truth:
     vendor/hermes-agent/website/docs/user-guide/skills/bundled/
     (auto-generated from each skill's SKILL.md). -->

# Bundled skills catalog

Every skill below ships with hermes-agent and is installed by default under
`${HERMES_HOME:-~/.hermes}/skills/<category>/<name>`. Skills activate when the
running task matches their description; no install step is needed. Env vars a
skill needs are read from `${HERMES_HOME}/.env` when the skill loads.

## Apple (macOS)

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| apple-notes | `skills/apple/apple-notes` | Manage Apple Notes via memo CLI: create, search, edit. | — |
| apple-reminders | `skills/apple/apple-reminders` | Apple Reminders via remindctl: add, list, complete. | — |
| findmy | `skills/apple/findmy` | Track Apple devices/AirTags via FindMy.app on macOS. | — |
| imessage | `skills/apple/imessage` | Send and receive iMessages/SMS via the imsg CLI on macOS. | — |

## Autonomous AI agents

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| claude-code | `skills/autonomous-ai-agents/claude-code` | Delegate coding to Claude Code CLI (features, PRs). | `ANTHROPIC_API_KEY` (alt to OAuth), `CLAUDE_CODE_EFFORT_LEVEL`, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` |
| codex | `skills/autonomous-ai-agents/codex` | Delegate coding to OpenAI Codex CLI (features, PRs). | `OPENAI_API_KEY` (alt to OAuth) |
| computer-use | `skills/autonomous-ai-agents/computer-use` | Drive the desktop background-first; escalate on signal. | `HERMES_CUA_DRIVER_CMD` (override cua-driver launch) |
| hermes-agent | `skills/autonomous-ai-agents/hermes-agent` | Use, configure, theme, extend, and orchestrate Hermes Agent. | — |
| opencode | `skills/autonomous-ai-agents/opencode` | Delegate coding to OpenCode CLI (features, PR review). | `OPENROUTER_API_KEY` (or `opencode auth login`) |

## Creative

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| architecture-diagram | `skills/creative/architecture-diagram` | Dark-themed SVG architecture/cloud/infra diagrams as HTML. | — |
| ascii-video | `skills/creative/ascii-video` | ASCII video: convert video/audio to colored ASCII MP4/GIF. | — |
| baoyu-infographic | `skills/creative/baoyu-infographic` | Infographics: 21 layouts × 21 styles. | — |
| claude-design | `skills/creative/claude-design` | Design one-off HTML artifacts (landing, deck, prototype). | — |
| design-md | `skills/creative/design-md` | Author/validate/export Google's DESIGN.md token spec files. | — |
| humanizer | `skills/creative/humanizer` | Humanize text: strip AI-isms and add real voice. | — |
| manim-video | `skills/creative/manim-video` | Manim CE animations: 3Blue1Brown math/algo videos. | — |
| p5js | `skills/creative/p5js` | p5.js sketches: gen art, shaders, interactive, 3D. | — |
| popular-web-designs | `skills/creative/popular-web-designs` | 54 real design systems (Stripe, Linear, Vercel) as HTML/CSS. | — |
| songwriting-and-ai-music | `skills/creative/songwriting-and-ai-music` | Songwriting craft and Suno AI music prompts. | — |

## Devops

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| sdlc-review | `skills/devops/sdlc-review` | Review Kanban handoffs and route verified outcomes. | — |

## Email

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| email-inbox-triage | `skills/email/email-inbox-triage` | Triage an inbox: prioritize threads, draft replies safely. | — |
| himalaya | `skills/email/himalaya` | Himalaya CLI: IMAP/SMTP email from terminal. | — |

## Media

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| gif-search | `skills/media/gif-search` | Search/download GIFs from Tenor via curl + jq. | `TENOR_API_KEY` |
| songsee | `skills/media/songsee` | Audio spectrograms/features (mel, chroma, MFCC) via CLI. | — |
| youtube-content | `skills/media/youtube-content` | YouTube transcripts to summaries, threads, blogs. | — |

## Note-taking

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| obsidian | `skills/note-taking/obsidian` | Read, search, create, and edit notes in the Obsidian vault. | `OBSIDIAN_VAULT_PATH` (fallback `~/Documents/Obsidian Vault`) |

## Productivity

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| airtable | `skills/productivity/airtable` | Airtable REST API via curl. Records CRUD, filters, upserts. | `AIRTABLE_API_KEY` |
| box | `skills/productivity/box` | Box manages cloud files, sharing, search, and metadata. | — |
| document-to-action-items | `skills/productivity/document-to-action-items` | Extract cited obligations, deadlines, tasks from documents. | — |
| docx | `skills/productivity/docx` | Create, read, edit, template, and review Word .docx files. | — |
| google-workspace | `skills/productivity/google-workspace` | Gmail, Calendar, Drive, Docs, Sheets via gws CLI or Python. | — (OAuth credential files, not env) |
| maps | `skills/productivity/maps` | Geocode, POIs, routes, timezones via OpenStreetMap/OSRM. | — |
| meeting-action-items | `skills/productivity/meeting-action-items` | Turn meeting notes into cited decisions, owners, tickets. | — |
| notion | `skills/productivity/notion` | Notion API + ntn CLI: pages, databases, markdown, Workers. | `NOTION_API_KEY` |
| pdf | `skills/productivity/pdf` | PDF files: create, read, merge, fill, OCR, edit text. | — |
| powerpoint | `skills/productivity/powerpoint` | Create, read, edit .pptx decks with python-pptx. | — |
| product-price-monitor | `skills/productivity/product-price-monitor` | Watch product, flight, or listing prices; alert on target. | — |
| teams-meeting-pipeline | `skills/productivity/teams-meeting-pipeline` | Teams meeting summaries, job replay, Graph subscriptions. | `MSGRAPH_TENANT_ID`, `MSGRAPH_CLIENT_ID`, `MSGRAPH_CLIENT_SECRET` (+ `MSGRAPH_WEBHOOK_CLIENT_STATE` for webhook replay) |
| weekly-review-planning | `skills/productivity/weekly-review-planning` | Weekly reset: commitments, stalled work, next-week plan. | — |
| xlsx | `skills/productivity/xlsx` | Create, read, edit Excel .xlsx workbooks and CSVs. | — |

## Research

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| arxiv | `skills/research/arxiv` | Search arXiv papers by keyword, author, category, or ID. | — |
| competitor-news-monitor | `skills/research/competitor-news-monitor` | Watch named companies for material news; cited digests. | — |
| grounded-citations | `skills/research/grounded-citations` | Ground answers and documents in cited, verifiable sources. | — |
| llm-wiki | `skills/research/llm-wiki` | Karpathy's LLM Wiki: build/query interlinked markdown KB. | `WIKI_PATH` (default `~/wiki`) |

## Social media

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| xurl | `skills/social-media/xurl` | X/Twitter via xurl CLI: raw post search, posting, DM, media. | — (xurl CLI auth config) |

## Software development

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| codebase-inspection | `skills/software-development/codebase-inspection` | Inspect codebases w/ pygount: LOC, languages, ratios. | — |
| dogfood | `skills/software-development/dogfood` | Exploratory QA of web apps: find bugs, evidence, reports. | — |
| github | `skills/software-development/github` | GitHub via gh CLI: PRs, issues, reviews, repos, auth. | — |
| hermes-agent-skill-authoring | `skills/software-development/hermes-agent-skill-authoring` | Author in-repo SKILL.md files: frontmatter and structure. | — |
| inspecting-hermes-desktop-dom | `skills/software-development/inspecting-hermes-desktop-dom` | Read the live Hermes desktop DOM/CSS over CDP. | `HERMES_DESKTOP_CDP_PORT` (default 9222, `off` disables) |
| node-inspect-debugger | `skills/software-development/node-inspect-debugger` | Debug Node.js via `--inspect` + Chrome DevTools Protocol CLI. | — |
| python-debugpy | `skills/software-development/python-debugpy` | Debug Python: pdb REPL + debugpy remote (DAP). | — |
| requesting-code-review | `skills/software-development/requesting-code-review` | Pre-commit review: security scan, quality gates, auto-fix. | — |
| simplify-code | `skills/software-development/simplify-code` | Parallel 4-agent cleanup of recent code changes. | — |
| spike | `skills/software-development/spike` | Throwaway experiments to validate an idea before build. | — |
| systematic-debugging | `skills/software-development/systematic-debugging` | 4-phase root cause debugging: understand bugs before fixing. | — |
| test-driven-development | `skills/software-development/test-driven-development` | TDD: enforce RED-GREEN-REFACTOR, tests before code. | — |

## Web

| Name | Path | Description | Env vars |
|------|------|-------------|----------|
| blocked-page-recovery | `skills/web/blocked-page-recovery` | Use when a fetch fails: 403/429, paywall, WAF, bot wall. | `JINA_API_KEY` (optional, enables Jina Reader fallback) |

## Example

A cron job running a bundled skill: bundled skills need no `skills` entry —
they are already installed — so the cron's prompt just references the task
and the skill activates when its description matches. List the skill name in
the cron's `skills` array only to pin it explicitly.

```yaml
name: price-watch-cron
schedule: "0 9 * * *"
prompt: |
  Check current prices for the products on the watch list and report
  any that dropped below target.
deliver: email
skills:
  - product-price-monitor    # bundled skills load without this; pin to be explicit
```
