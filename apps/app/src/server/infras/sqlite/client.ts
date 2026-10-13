import DatabaseClient from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventSchema,
  AgentSessionSummary,
  PaginatedResult,
  PaginationQuery,
} from "@/entities";
import { config } from "@/server/libs/config";

import { agentSessionEvents, agentTokens } from "./schema.js";
import { AppendAgentSessionEventsInput, Database } from "@/server/usecases/adaptors/database.js";

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
    await this.db.insert(agentSessionEvents).values(rows);
    return rows.length;
  }

  async listAgentSessionSummaries(
    agentId: string,
    query: PaginationQuery
  ): Promise<PaginatedResult<AgentSessionSummary>> {
    // limit + 1 probes for a next page without a separate count query.
    const rows = await this.db
      .select({
        sessionId: agentSessionEvents.sessionId,
        firstEventAt: sql<number>`min(${agentSessionEvents.timestamp})`,
        lastEventAt: sql<number>`max(${agentSessionEvents.timestamp})`,
        eventCount: sql<number>`count(*)`,
        finalizedCount: sql<number>`count(*) filter (where ${agentSessionEvents.type} = 'session_finalized')`,
      })
      .from(agentSessionEvents)
      .where(eq(agentSessionEvents.agentId, agentId))
      .groupBy(agentSessionEvents.sessionId)
      .orderBy(desc(sql`max(${agentSessionEvents.timestamp})`))
      .limit(query.limit + 1)
      .offset(query.offset);
    const page = rows.slice(0, query.limit);
    // Platform/model come from the earliest session_started row per session,
    // with the earliest llm_call filling in the model when no session_started
    // was ingested. One bounded follow-up query for the page's sessions.
    const firstEvents =
      page.length > 0
        ? await this.#firstEventsPerType(agentId, page.map((row) => row.sessionId))
        : [];
    const meta = new Map<string, { platform: string | null; model: string | null }>();
    for (const row of firstEvents) {
      const parsed = AgentSessionEventSchema.safeParse(row.payload);
      if (!parsed.success) continue;
      const entry = meta.get(row.sessionId) ?? { platform: null, model: null };
      if (parsed.data.type === "session_started") {
        entry.platform = parsed.data.platform;
        entry.model = parsed.data.model;
      } else if (parsed.data.type === "llm_call" && entry.model === null) {
        entry.model = parsed.data.model;
      }
      meta.set(row.sessionId, entry);
    }
    const items = page.map((row) => ({
      sessionId: row.sessionId,
      firstEventAt: new Date(row.firstEventAt).toISOString(),
      lastEventAt: new Date(row.lastEventAt).toISOString(),
      eventCount: Number(row.eventCount),
      finalized: Number(row.finalizedCount) > 0,
      platform: meta.get(row.sessionId)?.platform ?? null,
      model: meta.get(row.sessionId)?.model ?? null,
    }));
    return { items, hasMore: rows.length > query.limit };
  }

  // Earliest session_started and llm_call row per session, via a row_number()
  // window subquery (WHERE cannot filter on window results directly).
  async #firstEventsPerType(agentId: string, sessionIds: string[]) {
    const ranked = this.db
      .select({
        sessionId: agentSessionEvents.sessionId,
        type: agentSessionEvents.type,
        payload: agentSessionEvents.payload,
        rn: sql<number>`row_number() over (partition by ${agentSessionEvents.sessionId}, ${agentSessionEvents.type} order by ${agentSessionEvents.timestamp} asc)`.as(
          "rn"
        ),
      })
      .from(agentSessionEvents)
      .where(
        and(
          eq(agentSessionEvents.agentId, agentId),
          inArray(agentSessionEvents.sessionId, sessionIds),
          inArray(agentSessionEvents.type, ["session_started", "llm_call"])
        )
      )
      .as("ranked");
    return this.db
      .select({ sessionId: ranked.sessionId, type: ranked.type, payload: ranked.payload })
      .from(ranked)
      .where(eq(ranked.rn, 1));
  }

  async getAgentSession(agentId: string, sessionId: string): Promise<AgentSession> {
    const rows = await this.db
      .select({ payload: agentSessionEvents.payload })
      .from(agentSessionEvents)
      .where(
        and(eq(agentSessionEvents.agentId, agentId), eq(agentSessionEvents.sessionId, sessionId))
      )
      .orderBy(asc(agentSessionEvents.timestamp));
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
    return { sessionId, events };
  }

  async storeAgentToken(agentId: string, tokenHash: string): Promise<void> {
    await this.db
      .insert(agentTokens)
      .values({ agentId, tokenHash, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: agentTokens.agentId,
        set: { tokenHash, updatedAt: new Date(), revokedAt: null },
      });
  }

  async findAgentIdByTokenHash(tokenHash: string): Promise<string | null> {
    const rows = await this.db
      .select({ agentId: agentTokens.agentId })
      .from(agentTokens)
      .where(and(eq(agentTokens.tokenHash, tokenHash), isNull(agentTokens.revokedAt)));
    return rows.at(0)?.agentId ?? null;
  }

  async revokeAgentToken(agentId: string): Promise<void> {
    await this.db
      .update(agentTokens)
      .set({ revokedAt: new Date() })
      .where(eq(agentTokens.agentId, agentId));
  }
}
