import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Agent-session telemetry events ingested from hermes agents
// (POST /plugin/trpc/agentSession.agentSessionEvents). One row per event;
// the full typed payload is serialized into `payload` while the queryable
// fields are promoted to columns. `agentId` is filled later when per-agent
// token authentication lands — agents live in the Kubernetes Runtime, so
// there is no foreign key.
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
      table.timestamp
    ),
  ]
);