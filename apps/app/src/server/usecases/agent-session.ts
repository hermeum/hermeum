import {
  AgentSession,
  AgentSessionSummary,
  Context,
} from "@/entities";

import { BaseUseCase } from "./mixin";
import { AppendAgentSessionEventsInput } from "./adaptors/database";

export class AgentSessionUseCase extends BaseUseCase {
  async ingestAgentSessionEvents(
    batch: AgentSession,
    agentId: string | null = null
  ): Promise<number> {
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
  // session telemetry. Ingest stays unauthenticated but unscoped (plugin
  // protocol); per-agent token authentication is deferred there.
  async listAgentSessionSummaries(ctx: Context, agentId: string): Promise<AgentSessionSummary[]> {
    void ctx;
    const sessions = await this.db.listAgentSessionSummaries(agentId);
    this.logger.debug("listed agent sessions", { agentId, count: sessions.length });
    return sessions;
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