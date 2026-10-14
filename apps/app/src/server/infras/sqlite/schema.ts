import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Agent-session telemetry events ingested from hermes agents
// (POST /plugin/trpc/agentSession.agentSessionEvents). One row per event;
// the full typed payload is serialized into `payload` while the queryable
// fields are promoted to columns. `agentId` carries the agent resolved from
// the ingest token (nullable only for rows persisted before per-agent token
// authentication landed) — agents live in the Kubernetes Runtime, so there
// is no foreign key.
export const agentSessionEvents = sqliteTable(
  "agent_session_events",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id"),
    sessionId: text("session_id").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("agent_session_events_agent_session_idx").on(
      table.agentId,
      table.sessionId,
      table.type,
      table.timestamp
    ),
    // Covers the retention job's stale-session scan: a GROUP BY session_id
    // HAVING max(created_at) < cutoff reads this index instead of the table.
    index("agent_session_events_session_created_idx").on(table.sessionId, table.createdAt),
  ]
);

// Per-agent plugin ingest tokens (Authorization: Bearer on /plugin/trpc).
// Only the SHA-256 digest of the raw token is stored — the raw value ships
// exclusively in the managed agent's env (HERMEUM_PLUGIN_TOKEN, sensitive).
// Archiving an agent sets `revokedAt`; verification treats revoked rows as
// absent. `updatedAt` changes on re-provisioning, leaving a rotation trail.
// No foreign key — agents live in the Kubernetes Runtime.
export const agentTokens = sqliteTable("agent_tokens", {
  agentId: text("agent_id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});