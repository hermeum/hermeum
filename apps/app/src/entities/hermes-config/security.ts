import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/security#dangerous-command-approval
// Full field semantics: docs/official/security.md
//
// Mirrors the upstream top-level `approvals:` block plus the top-level
// `command_allowlist` (permanent allowlist) in config.yaml.
//
// Skipped on purpose: smart_policy and denial_breaker_threshold (upstream
// smart-approval extras documented outside the Dangerous Command Approval
// section). They pass through via looseObject. The session-level YOLO bypass
// (--yolo, HERMES_YOLO_MODE) is a runtime surface, not config — the config
// equivalent is mode: "off".
export const ApprovalsModeSchema = z
  .enum(["smart", "manual", "off"])
  .describe("Approval policy for dangerous shell commands.");

export type ApprovalsMode = z.infer<typeof ApprovalsModeSchema>;

export const HeadlessModeSchema = z
  .enum(["deny", "approve"])
  .describe("Headless dangerous-command policy.");

export type HeadlessMode = z.infer<typeof HeadlessModeSchema>;

export const ApprovalsSchema = z
  .looseObject({
    mode: ApprovalsModeSchema,
    timeout: z
      .number()
      .int()
      .optional()
      .describe("Seconds to wait for an approval reply before failing closed (deny)."),
    cron_mode: HeadlessModeSchema.optional().describe(
      "What cron jobs do headlessly on a dangerous command."
    ),
    single_query_mode: HeadlessModeSchema.optional().describe(
      "What one-shot single-query sessions do on a dangerous command."
    ),
    unattended_mode: HeadlessModeSchema.optional().describe(
      "What unattended programmatic platforms (webhook, msgraph_webhook, api_server) do on a dangerous command."
    ),
    deny: z
      .array(z.string())
      .optional()
      .describe("Glob patterns blocking matching terminal commands unconditionally, before --yolo and mode: off."),
    mcp_reload_confirm: z
      .boolean()
      .optional()
      .describe("Whether /reload-mcp asks before invalidating the MCP tool cache."),
    destructive_slash_confirm: z
      .boolean()
      .optional()
      .describe(
        "Whether destructive session slash commands (/clear, /new, /reset, /undo) prompt before discarding state."
      ),
  })
  .optional()
  .describe("Dangerous command approval configuration.");

export type Approvals = z.infer<typeof ApprovalsSchema>;

// Top-level key (not under approvals:) — patterns permanently allowed via
// upstream's "always" approval choice.
export const CommandAllowlistSchema = z
  .array(z.string())
  .optional()
  .describe("Permanently allowed dangerous command patterns.");

export type CommandAllowlist = z.infer<typeof CommandAllowlistSchema>;