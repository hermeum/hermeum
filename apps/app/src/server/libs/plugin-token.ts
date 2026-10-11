import { createHash, randomBytes } from "node:crypto";

// Per-agent plugin ingest tokens: the raw token ships exactly once, in the
// managed agent's env (HERMEUM_PLUGIN_TOKEN, sensitive); only its SHA-256
// digest is persisted, so the plugin tRPC context can resolve a bearer token
// to its agent without the server ever storing the credential itself.
// Hashing the presented value before the indexed lookup also sidesteps
// timing-side-channel comparisons.

export const PLUGIN_TOKEN_PREFIX = "hmt_";

export function generatePluginToken(): string {
  return PLUGIN_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashPluginToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}