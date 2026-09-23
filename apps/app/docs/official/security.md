---
name: security
category: core
description: Dangerous command approval (`approvals` and top-level `command_allowlist`) — approval modes, headless/unattended policies, timeout, deny rules, and the permanent allowlist.
---

# Security

Mirrors the upstream
[Security](https://hermes-agent.nousresearch.com/docs/user-guide/security)
page. Covers the dangerous-command approval surface — the `approvals:` block
and the top-level `command_allowlist` — the only security layers exposed via
`config.yaml` fields.

## Dangerous command approval (`approvals`)

Before executing any terminal command, the agent checks it against a curated
list of dangerous patterns. If a match is found, the approval policy decides
what happens — prompt the user, auto-approve, or deny. All of it is configured
via the top-level `approvals:` block in `config.yaml`; no env vars are
involved.

### Fields

| Field | Default | What it controls |
|---|---|---|
| `mode` | `smart` | Approval policy for dangerous shell commands — see [Approval modes](#approval-modes). |
| `timeout` | `300` | Seconds the agent waits for an approval reply before failing closed (deny). Shared by CLI prompts and messaging waits. |
| `cron_mode` | `deny` | What cron jobs do headlessly when they trigger a dangerous-command prompt. Accepts `deny` (default — block instantly, fail-closed) or `approve` (auto-approve everything in that context). |
| `single_query_mode` | `deny` | What one-shot single-query sessions do on a dangerous command. Accepts `deny` or `approve`. Mirrors `cron_mode`. |
| `unattended_mode` | `deny` | What unattended programmatic platforms (webhook, msgraph_webhook, api_server) do on a dangerous command. Accepts `deny` or `approve`. Mirrors `cron_mode`. |
| `mcp_reload_confirm` | `true` | Whether `/reload-mcp` asks before rebuilding the MCP tool set. Rebuilding invalidates the provider prompt cache (tool schemas live in the system prompt), so the next message re-sends full input tokens. |
| `destructive_slash_confirm` | `true` | Whether destructive session slash commands (`/clear`, `/new`, `/reset`, `/undo`) prompt before discarding conversation state. |

### Approval modes

| Mode | Behavior |
|------|----------|
| `smart` (default) | An auxiliary LLM assesses risk. Low-risk commands are auto-approved for that command only. Genuinely dangerous commands are auto-denied. Uncertain cases escalate to a manual prompt. |
| `manual` | Always prompt the user for approval on dangerous commands. |
| `off` | Disable all approval checks — equivalent to running with `--yolo`. All commands execute without prompts. |

:::warning
Setting `approvals.mode: off` disables all safety prompts. Use only in
trusted environments (CI/CD, containers, etc.).
:::

:::note
The session-level YOLO bypass (the `--yolo` CLI flag, the `/yolo` slash
command toggle, and the `HERMES_YOLO_MODE` env var) is upstream CLI/runtime
surface, not configuration — it is not part of `config.yaml`. The
config-level equivalent is `mode: off`. Even under YOLO or `mode: off`,
`approvals.deny` rules and the hardline blocklist still apply (see below).
:::

### Deny rules (`approvals.deny`)

`deny` is a list of fnmatch glob patterns that block matching terminal
commands unconditionally — **before** `--yolo`, `/yolo`, and `mode: off` are
consulted. It is the user-editable counterpart to the code-shipped hardline
blocklist: "let the agent do everything, except these specific things, ever."

```yaml
approvals:
  deny:
    - "git push --force*"
    - "*curl*|*sh*"
    - "dd if=* of=/dev/*"
```

### Hardline blocklist

Some commands are so catastrophic that the agent refuses to run them
**regardless** of `--yolo`, `mode: off`, headless `approve` modes, or
"allow always" clicks. This blocklist is fixed and code-shipped; it trips
before the approval layer even sees the command and has no override flag.

| Pattern | Why it's hardline |
|---|---|
| `rm -rf /` and obvious variants | Wipes the filesystem root |
| `rm -rf --no-preserve-root /` | The explicit "yes I mean root" variant |
| `:(){ :\|:& };:` (bash fork bomb) | Pegs the host until reboot |
| `mkfs.*` on a mounted root device | Formats the live system |
| `dd if=/dev/zero of=/dev/sd*` | Zeroes a physical disk |
| Piping untrusted URLs to `sh` at the rootfs top level | Remote-code-execution attack vector too broad to approve |

If the blocklist trips, the tool call returns an explanatory error and
nothing runs. A legitimate workflow that needs one of these commands (e.g. a
wipe-and-reinstall pipeline) must run it outside the agent.

### What triggers approval

| Pattern | Description |
|---------|-------------|
| `rm -r` / `rm --recursive` | Recursive delete |
| `rm ... /` | Delete in root path |
| `chmod 777/666` / `o+w` / `a+w` | World/other-writable permissions |
| `chmod --recursive` with unsafe perms | Recursive world/other-writable (long flag) |
| `chown -R root` / `chown --recursive root` | Recursive chown to root |
| `mkfs` | Format filesystem |
| `dd if=` | Disk copy |
| `> /dev/sd` | Write to block device |
| `DROP TABLE/DATABASE` | SQL DROP |
| `DELETE FROM` (without WHERE) | SQL DELETE without WHERE |
| `TRUNCATE TABLE` | SQL TRUNCATE |
| `> /etc/` | Overwrite system config |
| `systemctl stop/restart/disable/mask` | Stop/restart/disable system services |
| `kill -9 -1` | Kill all processes |
| `pkill -9` | Force kill processes |
| Fork bomb patterns | Fork bombs |
| `bash -c` / `sh -c` / `zsh -c` / `ksh -c` | Shell command execution via `-c` flag (including combined flags like `-lc`) |
| `python -e` / `perl -e` / `ruby -e` / `node -c` | Script execution via `-e`/`-c` flag |
| `curl ... \| sh` / `wget ... \| sh` | Pipe remote content to shell |
| `bash <(curl ...)` / `sh <(wget ...)` | Execute remote script via process substitution |
| `tee` to `/etc/`, `~/.ssh/`, `~/.hermes/.env` | Overwrite sensitive file via tee |
| `>` / `>>` to `/etc/`, `~/.ssh/`, `~/.hermes/.env` | Overwrite sensitive file via redirection |
| `xargs rm` | xargs with rm |
| `find -exec rm` / `find -delete` | Find with destructive actions |
| `cp`/`mv`/`install` to `/etc/` | Copy/move file into system config |
| `sed -i` / `sed --in-place` on `/etc/` | In-place edit of system config |
| `pkill`/`killall` hermes/gateway | Self-termination prevention |
| `gateway run` with `&`/`disown`/`nohup`/`setsid` | Prevents starting gateway outside service manager |
| `docker stop/kill/restart`, `docker compose down/stop/kill/restart` | Container lifecycle (also catches global flags and `docker-compose`) |
| `docker -H`/`--host`/`--context`, `DOCKER_HOST=`/`DOCKER_CONTEXT=` | Docker daemon redirect — the command targets a different (often remote) daemon |
| `docker context use` | Switches the default daemon for all future docker commands |
| `podman --remote`/`-r`/`--url`/`--connection`/`--identity`, `CONTAINER_HOST=` | Podman remote daemon redirect |

:::info Container bypass
When running in `docker`, `singularity`, `modal`, `daytona`, or
`vercel_sandbox` terminal backends, dangerous command checks are **skipped**
because the container itself is the security boundary. Destructive commands
inside a container can't harm the host.
:::

### Permanent allowlist (`command_allowlist`)

`command_allowlist` is a top-level key (not under `approvals:`) listing
dangerous command patterns that are silently approved in all future sessions.
Upstream writes patterns here when a user approves a dangerous command with
"always"; patterns are loaded at startup and approved without prompting.

```yaml
command_allowlist:
  - rm
  - systemctl
```

:::note
Destructive classes are never safe to allowlist: recursive deletes, `sudo`,
disk/device writes, credential and system-config edits, pipe-to-shell, SQL
DROP/TRUNCATE, and process kills stay dangerous no matter how often they have
been approved before. Audit this list periodically.
:::