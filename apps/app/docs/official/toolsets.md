---
name: toolsets
category: reference
description: Toolsets reference — named bundles of tools controlling what the agent can do; core and platform toolsets for the `toolsets` config field.
---

# Toolsets (`config.toolsets`)

Toolsets are named bundles of tools that control what the agent can do.
They are the primary mechanism for configuring tool availability. Every
tool belongs to exactly one toolset; enabling a toolset makes all tools
in that bundle available.

**Kinds:**

- **Core** — a single logical group of related tools (e.g. `file`
  bundles `read_file`, `write_file`, `patch`, `search_files`).
- **Composite** — combines multiple core toolsets for a common scenario
  (e.g. `debugging` = `file` + `terminal` + `web`).
- **Platform** — the complete tool configuration for a deployment
  context (e.g. `hermes-cli` is the default for CLI sessions).

## Core toolsets

| Toolset | Tools | Purpose |
|---------|-------|---------|
| `browser` | `browser_back`, `browser_cdp`, `browser_click`, `browser_console`, `browser_dialog`, `browser_get_images`, `browser_navigate`, `browser_press`, `browser_scroll`, `browser_snapshot`, `browser_type`, `browser_vision`, `web_search` | Core browser automation; includes `web_search` as a fallback for quick lookups. `browser_cdp` and `browser_dialog` are gated at runtime — registered only when a CDP endpoint is reachable at session start. |
| `clarify` | `clarify` | Ask the user a question when clarification is needed. |
| `code_execution` | `execute_code` | Run Python scripts that call Hermes tools programmatically. |
| `connections` | `manage_connections` | Connect the user to apps: managed connector accounts and local MCP servers. |
| `coding` | composite (`file` + `terminal` + `search` + `web` + `skills` + `browser` + `todo` + `memory` + `session_search` + `clarify` + `code_execution` + `delegation` + `vision`) | Coding-focused bundle for software work. |
| `cronjob` | `cronjob` | Schedule and manage recurring tasks. |
| `debugging` | composite (`file` + `terminal` + `web`) | Debug bundle — file, process/terminal, web extract/search. |
| `delegation` | `delegate_task` | Spawn isolated subagent instances for parallel work. |
| `discord` | `discord` | Core Discord text/embed/DM actions (gateway-only). |
| `discord_admin` | `discord_admin` | Discord moderation (bans, roles, channels); requires bot permissions. |
| `feishu_doc` | `feishu_doc_read` | Read Feishu/Lark document content (comment handler only). |
| `feishu_drive` | `feishu_drive_add_comment`, `feishu_drive_list_comments`, `feishu_drive_list_comment_replies`, `feishu_drive_reply_comment` | Feishu/Lark drive comment ops; scoped to the comment agent, not on `hermes-cli`. |
| `file` | `patch`, `read_file`, `search_files`, `write_file` | File reading, writing, searching, and editing. |
| `homeassistant` | `ha_call_service`, `ha_get_state`, `ha_list_entities`, `ha_list_services` | Smart home control via Home Assistant; only available when `HASS_TOKEN` is set. |
| `computer_use` | `computer_use` | Background desktop control via cua-driver; requires `cua-driver` on `$PATH`. |
| `context_engine` | _(varies)_ | Runtime tools exposed by the active context-engine plugin. |
| `image_gen` | `image_generate` | Text-to-image generation. |
| `video_gen` | `video_generate`, `xai_video_edit`, `xai_video_extend` | Text-to-video and image-to-video; edit/extend tools are gated on xAI credentials. |
| `kanban` | `kanban_attach`, `kanban_attach_url`, `kanban_attachments`, `kanban_block`, `kanban_comment`, `kanban_complete`, `kanban_create`, `kanban_heartbeat`, `kanban_link`, `kanban_list`, `kanban_request_changes`, `kanban_request_review`, `kanban_show`, `kanban_unblock` | Multi-agent board coordination; opt-in only (see key points). |
| `memory` | `memory` | Persistent cross-session memory management. |
| `desktop_ui` | `annotate_preview`, `close_preview`, `close_terminal`, `drive_preview`, `focus_pane`, `open_preview`, `react_to_message`, `read_preview`, `read_terminal`, `read_window_below`, `tour` | Act on the Hermes desktop app itself; never on CLI, messaging, or cron sessions. |
| `project` | `project_create`, `project_list`, `project_switch` | Desktop Projects (multi-folder workspaces); GUI sessions only. |
| `safe` | `image_generate`, `vision_analyze`, `web_extract`, `web_search` | Read-only research + media generation — no file writes, terminal, or code execution. |
| `search` | `web_search` | Web search only (without extract). |
| `session_search` | `session_search` | Search past conversation sessions. |
| `skills` | `skill_manage`, `skill_view`, `skills_list` | Skill CRUD and browsing. |
| `spotify` | `spotify_albums`, `spotify_devices`, `spotify_library`, `spotify_playback`, `spotify_playlists`, `spotify_queue`, `spotify_search` | Native Spotify control (bundled `spotify` plugin). |
| `terminal` | `process`, `terminal` | Shell command execution and background process management. |
| `todo` | `todo` | Task list management within a session. |
| `tts` | `text_to_speech` | Text-to-speech audio generation. |
| `vision` | `vision_analyze` | Image analysis via vision-capable models. |
| `video` | `video_analyze` | Video analysis; opt-in — not in the default toolset. |
| `web` | `web_extract`, `web_search` | Web search and page content extraction. |
| `x_search` | `x_search` | Read-only public X discovery; schema registered only when xAI credentials are configured. |
| `yuanbao` | `yb_query_group_info`, `yb_query_group_members`, `yb_search_sticker`, `yb_send_dm`, `yb_send_sticker` | Yuanbao DM/group actions; registered only on `hermes-yuanbao`. |

## Platform toolsets

Platform toolsets define the complete tool configuration for a
deployment target. Most messaging platforms (`hermes-cron`,
`hermes-telegram`, `hermes-slack`, `hermes-whatsapp`, `hermes-signal`,
`hermes-matrix`, `hermes-mattermost`, `hermes-email`, `hermes-sms`,
`hermes-bluebubbles`, `hermes-dingtalk`, `hermes-qqbot`, `hermes-wecom`,
`hermes-weixin`, `hermes-homeassistant`) are identical to `hermes-cli`.

| Toolset | Difference from `hermes-cli` |
|---------|------------------------------|
| `hermes-cli` | Full toolset — the default for interactive CLI sessions (file, terminal, web, browser, memory, skills, vision, image_gen, todo, tts, delegation, code_execution, cronjob, session_search, clarify, computer_use, Home Assistant, kanban). |
| `hermes-acp` | Drops `clarify`, `cronjob`, `image_generate`, `text_to_speech`, `computer_use`, Home Assistant tools, and kanban. Focused on coding in IDE context. |
| `hermes-api-server` | Drops `clarify`, `text_to_speech`, `computer_use`, and kanban. Suitable for programmatic access without user interaction. |
| `hermes-discord` | Adds `discord` and `discord_admin`. |
| `hermes-feishu` | Adds the five `feishu_doc_*` / `feishu_drive_*` tools (document-comment handler only, not the regular chat adapter). |
| `hermes-yuanbao` | Adds the five `yb_*` tools (DM/group/sticker). |
| `hermes-webhook` | Restricted safe subset — only `web_search`, `web_extract`, `vision_analyze`, and `clarify`. No terminal, file, or browser access. |
| `hermes-gateway` | Internal union of every `hermes-<platform>` toolset; used when the gateway must accept any message source. |

