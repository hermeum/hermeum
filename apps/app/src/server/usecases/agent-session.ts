import {
  AgentSession,
  AgentSessionSummary,
  Context,
  PaginatedResult,
  PaginationQuery,
} from "@/entities";

import { BaseUseCase } from "./mixin";
import { AppendAgentSessionEventsInput } from "./adaptors/database";

// Retention cadence: sessions whose most recent event has aged past the
// configured window (see pruneAgentSessions) are pruned on this in-process
// cycle. Concurrent replicas are already handled by the Database adaptor's
// own guard (advisory lock on Postgres; SQLite deployments are single-replica
// by the chart), so concurrent runs cost the losers only a skipped cycle.
const RUN_INTERVAL_MS = 6 * 3600 * 1000;
const MS_PER_DAY = 24 * 3600 * 1000;

export class AgentSessionUseCase extends BaseUseCase {
  #retentionStarted = false;
  #retentionIntervalTimer: ReturnType<typeof setInterval> | undefined = undefined;

  async ingestAgentSessionEvents(batch: AgentSession, agentId: string): Promise<number> {
    const input: AppendAgentSessionEventsInput = {
      agentId,
      sessionId: batch.sessionId,
      events: batch.events,
    };
    const accepted = await this.db.appendAgentSessionEvents(input);
    this.logger.info("ingested agent session events", {
      sessionId: batch.sessionId,
      agentId,
      accepted,
    });
    return accepted;
  }

  // Reads are not ownership-guarded: any authenticated user may browse agent
  // session telemetry. Ingest is authenticated by the plugin tRPC context
  // (per-agent token → resolved agentId) before reaching this use case.
  async listAgentSessionSummaries(
    ctx: Context,
    agentId: string,
    query: PaginationQuery
  ): Promise<PaginatedResult<AgentSessionSummary>> {
    void ctx;
    const result = await this.db.listAgentSessionSummaries(agentId, query);
    this.logger.debug("listed agent sessions", { agentId, count: result.items.length });
    return result;
  }

  async getAgentSession(
    ctx: Context,
    agentId: string,
    sessionId: string
  ): Promise<AgentSession> {
    void ctx;
    const session = await this.db.getAgentSession(agentId, sessionId);
    this.logger.debug("got agent session events", { agentId, sessionId, count: session.events.length });
    return session;
  }

  // Whole-session retention policy: a session is pruned only once its most
  // recent event has aged past the window, so the trajectory UI never shows a
  // half-deleted session. Deletion itself is batched by the Database adaptor
  // (see deleteAgentSessionsLastActiveBefore). Public so the schedule (below)
  // and any ad-hoc invocation share one implementation; a retentionDays of 0
  // is a caller concern — the schedule simply never starts.
  async pruneAgentSessions(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);
    const deleted = await this.db.deleteAgentSessionsLastActiveBefore(cutoff);
    this.logger.info("retention pruned agent sessions", {
      cutoff: cutoff.toISOString(),
      deleted,
    });
    return deleted;
  }

  // In-process scheduler for the retention cycle: one sweep right away (e.g.
  // draining the backlog after an upgrade) and then once per cycle. Timers are
  // runtime globals, not injected infrastructure, so they run in the use case;
  // unref'd, they never hold the process open. Failing runs are contained here
  // — retention must never take the web server down with it — and the next
  // cycle retries.
  startAgentSessionRetention(retentionDays: number): void {
    if (retentionDays === 0 || this.#retentionStarted) return;
    this.#retentionStarted = true;
    void this.#runRetention(retentionDays);
    this.#retentionIntervalTimer = setInterval(
      () => void this.#runRetention(retentionDays),
      RUN_INTERVAL_MS
    );
    this.#retentionIntervalTimer.unref();
  }

  stopAgentSessionRetention(): void {
    this.#retentionStarted = false;
    if (this.#retentionIntervalTimer !== undefined) {
      clearInterval(this.#retentionIntervalTimer);
      this.#retentionIntervalTimer = undefined;
    }
  }

  async #runRetention(retentionDays: number): Promise<void> {
    try {
      await this.pruneAgentSessions(retentionDays);
    } catch (e) {
      this.logger.warn("agent session retention run failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}