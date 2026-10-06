import DatabaseClient from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import {
  AgentSessionEvent,
  AgentSessionEventSchema,
  AgentSessionSummary,
} from "@/entities";
import { config } from "@/server/libs/config";

import { agentSessionEvent } from "./schema.js";
import {
  AppendAgentSessionEventsInput,
  Database,
} from "@/server/usecases/adaptors/database.js";

// SQLite persistence for the app database. Owns the connection and implements
// the Database adaptor against the sqlite schema; injected into use cases via
// BaseUseCase (see mixin.ts).

export function createSqliteClient() {
  // Accept both "file:./path.db" and "file:///abs/path.db" forms
  const client = new DatabaseClient(config.databaseUrl.replace(/^file:(\/\/)?/, ""));
  return drizzleSqlite(client);
}

export class SqliteDatabase implements Database {
  // The connection opens lazily on first use, so constructing the adaptor
  // (e.g. as a BaseUseCase default) never touches the database.
  #db?: ReturnType<typeof createSqliteClient>;

  private get db() {
    return (this.#db ??= createSqliteClient());
  }

  async appendAgentSessionEvents(input: AppendAgentSessionEventsInput): Promise<number> {
    const rows = input.events.map((event) => ({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      sessionId: input.sessionId,
      eventId: event.eventId,
      type: event.type,
      timestamp: new Date(event.timestamp),
      payload: event,
    }));
    if (rows.length === 0) return 0;
    await this.db.insert(agentSessionEvent).values(rows);
    return rows.length;
  }

  async listAgentSessions(agentId: string): Promise<AgentSessionSummary[]> {
    const rows = await this.db
      .select({
        sessionId: agentSessionEvent.sessionId,
        firstEventAt: sql<number>`min(${agentSessionEvent.timestamp})`,
        lastEventAt: sql<number>`max(${agentSessionEvent.timestamp})`,
        eventCount: sql<number>`count(*)`,
      })
      .from(agentSessionEvent)
      .where(eq(agentSessionEvent.agentId, agentId))
      .groupBy(agentSessionEvent.sessionId)
      .orderBy(desc(sql`max(${agentSessionEvent.timestamp})`));
    return rows.map((row) => ({
      sessionId: row.sessionId,
      firstEventAt: new Date(row.firstEventAt).toISOString(),
      lastEventAt: new Date(row.lastEventAt).toISOString(),
      eventCount: Number(row.eventCount),
    }));
  }

  async getAgentSessionEvents(agentId: string, sessionId: string): Promise<AgentSessionEvent[]> {
    const rows = await this.db
      .select({ payload: agentSessionEvent.payload })
      .from(agentSessionEvent)
      .where(
        and(
          eq(agentSessionEvent.agentId, agentId),
          eq(agentSessionEvent.sessionId, sessionId)
        )
      )
      .orderBy(asc(agentSessionEvent.timestamp));
    // Stored payloads are data at rest — one persisted under an older schema
    // must not 500 the trajectory UI read, so invalid rows are skipped.
    const events: AgentSessionEvent[] = [];
    for (const row of rows) {
      const parsed = AgentSessionEventSchema.safeParse(row.payload);
      if (parsed.success) {
        events.push(parsed.data);
      } else {
        console.warn("skipping stored agent-session event that fails the current schema", {
          issue: parsed.error.message,
        });
      }
    }
    return events;
  }
}