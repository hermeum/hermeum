import {
  AgentSession,
  AgentSessionSummary,
  Context,
  PaginatedResult,
  PaginationQuery,
} from "@/entities";

import { BaseUseCase } from "./mixin";
import { AppendAgentSessionEventsInput } from "./adaptors/database";

export class AgentSessionUseCase extends BaseUseCase {
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
}