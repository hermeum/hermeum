import type { Agent, AgentInput } from "./schema";

// API server settings can be configured via config.yaml
// (config.gateway.api_server.enabled / port) or via env vars
// (API_SERVER_ENABLED / API_SERVER_PORT). Environment variables take
// precedence over the config values when both are set (upstream behavior);
// the config block acts as a fallback when the env var is absent. The
// bearer token is env-only by Hermeum policy (API_SERVER_KEY, sensitive).
// See docs/official/api-server.md.
const API_SERVER_DEFAULT_PORT = 8642;

export function isApiServerEnabled(input: AgentInput): boolean {
  const envRaw = input.env?.find((v) => v.name === "API_SERVER_ENABLED")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    return envRaw.toLowerCase() === "true";
  }
  return input.config?.gateway?.api_server?.enabled ?? false;
}

export function getApiServerPort(input: AgentInput): number {
  const envRaw = input.env?.find((v) => v.name === "API_SERVER_PORT")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    return Number.isInteger(n) && n > 0 ? n : API_SERVER_DEFAULT_PORT;
  }
  const configPort = input.config?.gateway?.api_server?.port;
  if (configPort !== undefined && configPort > 0) return configPort;
  return API_SERVER_DEFAULT_PORT;
}

// Webhook enablement is env-only (WEBHOOK_ENABLED=true);
// config.platforms.webhook carries only routes and other non-secret
// settings. Enabling the platform (and the reserved WEBHOOK_SECRET env
// entry) stays on the env-var path.
const WEBHOOK_DEFAULT_PORT = 8644;

export function isWebhookEnabled(input: AgentInput): boolean {
  return (
    input.env?.some(
      (v) => v.name === "WEBHOOK_ENABLED" && v.value.toLowerCase() === "true",
    ) ?? false
  );
}

export function getWebhookPort(input: AgentInput): number {
  const configPort = input.config?.platforms?.webhook?.extra?.port;
  if (configPort !== undefined) return configPort;
  const envRaw = input.env?.find((v) => v.name === "WEBHOOK_PORT")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    return Number.isInteger(n) && n > 0 ? n : WEBHOOK_DEFAULT_PORT;
  }
  return WEBHOOK_DEFAULT_PORT;
}

// Teams is an HTTP webhook platform (like webhook / api-server). The
// client secret is env-only by Hermeum policy (the sensitive
// TEAMS_CLIENT_SECRET env entry). client_id and tenant_id are non-secret
// and accepted from either source: config (platforms.teams.extra) or
// their TEAMS_* env vars (Teams reads env-first, so literal config values
// work). An explicit `enabled` flag overrides the credentials-presence
// detection (set false to disable while keeping creds); when `enabled`
// is absent, Teams is on when all three credentials are set.
const TEAMS_DEFAULT_PORT = 3978;

function hasAllTeamsCredentials(input: AgentInput): boolean {
  const extra = input.config?.platforms?.teams?.extra;
  const hasEnv = (name: string) =>
    input.env?.some((v) => v.name === name && v.value.trim() !== "") ?? false;
  return (
    ((extra?.client_id !== undefined && extra.client_id.trim() !== "") || hasEnv("TEAMS_CLIENT_ID")) &&
    hasEnv("TEAMS_CLIENT_SECRET") &&
    ((extra?.tenant_id !== undefined && extra.tenant_id.trim() !== "") || hasEnv("TEAMS_TENANT_ID"))
  );
}

export function isTeamsEnabled(input: AgentInput): boolean {
  const enabledFlag = input.config?.platforms?.teams?.enabled;
  if (enabledFlag !== undefined) return enabledFlag;
  return hasAllTeamsCredentials(input);
}

export function getTeamsPort(input: AgentInput): number {
  const configPort = input.config?.platforms?.teams?.extra?.port;
  if (configPort !== undefined) return configPort;
  const envRaw = input.env?.find((v) => v.name === "TEAMS_PORT")?.value;
  if (envRaw !== undefined && envRaw.trim() !== "") {
    const n = Number(envRaw);
    return Number.isInteger(n) && n > 0 ? n : TEAMS_DEFAULT_PORT;
  }
  return TEAMS_DEFAULT_PORT;
}

// Inbound HTTP platform availability — a derived, read-only view of which
// inbound HTTP message platforms (api-server / webhook / teams) are wired up
// for an agent, computed from its config + env. Not persisted.
// https://hermes-agent.nousresearch.com/docs/user-guide/messaging

export enum PlatformId {
  ApiServer = "api-server",
  Webhook = "webhook",
  Teams = "teams",
}

export interface PlatformAvailability {
  status: "available" | "unavailable";
  /** Short explanation shown when status is not "available". */
  reason?: string;
  /**
   * Base endpoint URL for this platform, when available.
   * For ingress endpoints the URL carries no port — each HTTP platform gets
   * its own host (`<agent-id>.<platform-label>.<base hostname>`, or
   * `<agent-id>-<platform-label>.<base hostname>` when hosts are flattened).
   * For internal (`*.svc.cluster.local`) endpoints the platform's Service
   * port is embedded. Absent when `agent.endpoints` is null or missing.
   */
  endpoint?: string;
}

/**
 * Ingress host labels per HTTP platform.
 * Each platform is exposed on its own host
 * `<agent-id>.<label>.<base hostname>` — or, when hosts are flattened,
 * `<agent-id>-<label>.<base hostname>` — mapped wholesale to the platform's
 * Service port (routing is host-based; the whole host is the backend's
 * root).
 */
export const PLATFORM_INGRESS_LABELS: Record<PlatformId, string> = {
  [PlatformId.ApiServer]: "api",
  [PlatformId.Webhook]: "hooks",
  [PlatformId.Teams]: "teams",
};

const PLATFORM_LABELS: Record<PlatformId, string> = {
  [PlatformId.ApiServer]: "API Server",
  [PlatformId.Webhook]: "Webhook",
  [PlatformId.Teams]: "Teams",
};

export function getPlatformLabel(id: PlatformId): string {
  return PLATFORM_LABELS[id];
}

export function derivePlatformAvailability(id: PlatformId, agent: Agent): PlatformAvailability {
  // Full-qualified endpoint URL per platform, authored by buildAgentEndpoints
  // (or the MockRuntime) — present for every enabled HTTP platform.
  const endpoint = agent.endpoints?.[id] ?? undefined;

  switch (id) {
    case PlatformId.ApiServer: {
      if (!isApiServerEnabled(agent)) {
        return {
          status: "unavailable",
          reason: "Set API_SERVER_ENABLED=true (or config.gateway.api_server.enabled).",
        };
      }
      return { status: "available", ...(endpoint && { endpoint }) };
    }
    case PlatformId.Webhook: {
      if (!isWebhookEnabled(agent)) {
        return {
          status: "unavailable",
          reason: "Set WEBHOOK_ENABLED=true (and the WEBHOOK_SECRET env entry).",
        };
      }
      return { status: "available", ...(endpoint && { endpoint }) };
    }
    case PlatformId.Teams: {
      // An explicit `enabled: false` short-circuits to unavailable even when
      // credentials are present.
      if (!isTeamsEnabled(agent)) {
        const enabledFlag = agent.config?.platforms?.teams?.enabled;
        if (enabledFlag === false) {
          return { status: "unavailable", reason: "Disabled by config.platforms.teams.enabled." };
        }
        const env = agent.env ?? [];
        const extra = agent.config?.platforms?.teams?.extra;
        const missing: string[] = [];
        if (!(extra?.client_id?.trim() || env.some((v) => v.name === "TEAMS_CLIENT_ID" && v.value.trim() !== ""))) {
          missing.push("client_id");
        }
        if (!env.some((v) => v.name === "TEAMS_CLIENT_SECRET" && v.value.trim() !== "")) {
          missing.push("client_secret");
        }
        if (!(extra?.tenant_id?.trim() || env.some((v) => v.name === "TEAMS_TENANT_ID" && v.value.trim() !== ""))) {
          missing.push("tenant_id");
        }
        return {
          status: "unavailable",
          reason:
            `Missing credential${missing.length > 1 ? "s" : ""}: ${missing.join(", ")} ` +
            "(client_id/tenant_id via config.platforms.teams.extra or the matching " +
            "TEAMS_* env var; client_secret via the TEAMS_CLIENT_SECRET env var).",
        };
      }
      return { status: "available", ...(endpoint && { endpoint }) };
    }
  }
}