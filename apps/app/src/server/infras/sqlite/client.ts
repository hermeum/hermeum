import DatabaseClient from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";

import {
  AgentMemoryEntry,
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventSchema,
  AgentSessionSummary,
  PaginatedResult,
  PaginationQuery,
  deriveAgentSessionStatus,
} from "@/entities";
import { config } from "@/server/libs/config";

import { agentMemoryEntries, agentSessionEvents, agentTokens } from "./schema.js";
import { AppendAgentSessionEventsInput, Database } from "@/server/usecases/adaptors/database.js";

// SQLite persistence for the app database. Owns the connection and implements
// the Database adaptor against the sqlite schema; injected into use cases via
// BaseUseCase (see mixin.ts).

// Retention batches at most this many stale sessions per DELETE statement, so
// a large backlog drains in short transactions instead of one long-running one.
const RETENTION_BATCH_SESSIONS = 500;

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
        finalized:
          sql<number | null>`max(case when ${agentSessionEvents.type} = 'session_finalized' then ${agentSessionEvents.timestamp} end) = max(${agentSessionEvents.timestamp})`,
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
    const items = page.map((row) => {
      const firstEventAt = new Date(row.firstEventAt).toISOString();
      const lastEventAt = new Date(row.lastEventAt).toISOString();
      return {
        sessionId: row.sessionId,
        firstEventAt,
        lastEventAt,
        eventCount: Number(row.eventCount),
        status: deriveAgentSessionStatus(row.finalized === 1, lastEventAt),
        platform: meta.get(row.sessionId)?.platform ?? null,
        model: meta.get(row.sessionId)?.model ?? null,
      };
    });
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
        rn: sql<number>`row_number() over (partition by ${agentSessionEvents.sessionId}, ${agentSessionEvents.type} order by ${agentSessionEvents.timestamp} asc, ${agentSessionEvents.id} asc)`.as(
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

  async deleteAgentSessionsLastActiveBefore(cutoff: Date): Promise<number> {
    // Whole-session retention: a session is pruned only once its most recent
    // event has aged past the cutoff, so the trajectory UI never shows a
    // half-deleted session. The staleness subquery is self-contained
    // (re-evaluated per batch at delete time), which spares a session that
    // receives new events mid-run. Batching by session count terminates the
    // loop: each non-empty batch removes those sessions entirely, so the next
    // scan sees strictly fewer stale sessions; an empty batch ends the run.
    let deleted = 0;
    this.db.transaction((tx) => {
      for (;;) {
        // created_at is integer unixepoch-ms here (`timestamp_ms` mode), so a
        // raw cutoff ms integer compares exactly against the stored column.
        const result = tx
          .delete(agentSessionEvents)
          .where(
            sql`${agentSessionEvents.sessionId} in (
              select ${agentSessionEvents.sessionId} from ${agentSessionEvents}
              group by ${agentSessionEvents.sessionId}
              having max(${agentSessionEvents.createdAt}) < ${cutoff.getTime()}
              limit ${RETENTION_BATCH_SESSIONS}
            )`
          )
          .run();
        deleted += result.changes;
        if (result.changes === 0) break;
      }
    });
    return deleted;
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

  async listMemoryEntries(agentId: string): Promise<AgentMemoryEntry[]> {
    const rows = await this.db
      .select()
      .from(agentMemoryEntries)
      .where(eq(agentMemoryEntries.agentId, agentId))
      .orderBy(asc(agentMemoryEntries.position));
    return rows.map(toMemoryEntry);
  }

  async saveMemoryEntries(agentId: string, entries: AgentMemoryEntry[]): Promise<void> {
    // Keyed on id, so an entry's id is a durable key rather than an artifact
    // of a rewrite: unchanged entries keep their row (no churn, created_at
    // preserved), changed entries update in place, and only entries the use
    // case dropped are deleted. Position carries the list order; one
    // transaction keeps the save atomic.
    this.db.transaction((tx) => {
      const ids = entries.map((entry) => entry.id);
      if (ids.length === 0) {
        tx.delete(agentMemoryEntries).where(eq(agentMemoryEntries.agentId, agentId)).run();
        return;
      }
      tx.delete(agentMemoryEntries)
        .where(and(eq(agentMemoryEntries.agentId, agentId), notInArray(agentMemoryEntries.id, ids)))
        .run();
      tx.insert(agentMemoryEntries)
        .values(
          entries.map((entry, position) => ({
            id: entry.id,
            agentId,
            content: entry.content,
            position,
            createdAt: new Date(entry.createdAt),
            updatedAt: new Date(entry.updatedAt),
          }))
        )
        .onConflictDoUpdate({
          target: agentMemoryEntries.id,
          // `excluded` is the row proposed by this INSERT: apply its values to
          // the existing row, keeping the stored created_at.
          set: {
            content: sql`excluded.content`,
            position: sql`excluded.position`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .run();
    });
  }

  async addMemoryEntry(
    agentId: string,
    entry: Pick<AgentMemoryEntry, "id" | "content">
  ): Promise<AgentMemoryEntry> {
    // Append: position is the next slot for this agent, computed inside the
    // INSERT so no read is needed; the database stamps both timestamps (one
    // clock). Single-replica deployments serialize writes; multi-replica
    // Postgres would need a per-agent lock here.
    const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
    const row = await this.db
      .insert(agentMemoryEntries)
      .values({
        id: entry.id,
        agentId,
        content: entry.content,
        position: sql<number>`(select coalesce(max(${agentMemoryEntries.position}) + 1, 0) from ${agentMemoryEntries} where ${agentMemoryEntries.agentId} = ${agentId})`,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();
    if (!row) {
      throw new Error("Failed to create memory entry.");
    }
    return toMemoryEntry(row);
  }

  async patchMemoryEntry(
    agentId: string,
    id: string,
    content: string
  ): Promise<AgentMemoryEntry | null> {
    const row = await this.db
      .update(agentMemoryEntries)
      .set({ content, updatedAt: sql`(cast(unixepoch('subsecond') * 1000 as integer))` })
      .where(and(eq(agentMemoryEntries.agentId, agentId), eq(agentMemoryEntries.id, id)))
      .returning()
      .get();
    return row ? toMemoryEntry(row) : null;
  }

  async removeMemoryEntry(agentId: string, id: string): Promise<boolean> {
    const result = await this.db
      .delete(agentMemoryEntries)
      .where(and(eq(agentMemoryEntries.agentId, agentId), eq(agentMemoryEntries.id, id)))
      .run();
    return result.changes > 0;
  }
}

type MemoryEntryRow = typeof agentMemoryEntries.$inferSelect;

function toMemoryEntry(row: MemoryEntryRow): AgentMemoryEntry {
  return {
    id: row.id,
    agentId: row.agentId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
