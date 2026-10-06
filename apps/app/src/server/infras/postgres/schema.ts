import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Agent-session telemetry events ingested from hermes agents
// (POST /plugin/trpc/agentSession.agentSessionEvents). One row per event;
// the full typed payload is serialized into `payload` while the queryable
// fields are promoted to columns. `agentId` is filled later when per-agent
// token authentication lands — agents live in the Kubernetes Runtime, so
// there is no foreign key.
export const agentSessionEvent = pgTable(
  "agent_session_event",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id"),
    sessionId: text("session_id").notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").notNull(),
    timestamp: timestamp("timestamp").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("agent_session_event_agent_session_idx").on(
      table.agentId,
      table.sessionId,
      table.timestamp
    ),
  ]
);