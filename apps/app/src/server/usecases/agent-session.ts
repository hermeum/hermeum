import {
  AgentSession,
  AgentSessionSummary,
  Context,
} from "@/entities";

import { BaseUseCase, OwnershipGuarded } from "./mixin";
import { AppendAgentSessionEventsInput } from "./adaptors/database";

export class AgentSessionUseCase extends OwnershipGuarded(BaseUseCase) {
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

  async listAgentSessionSummaries(ctx: Context, agentId: string): Promise<AgentSessionSummary[]> {
    await this.requireOwnedAgent(ctx, agentId);
    const sessions = await this.db.listAgentSessionSummaries(agentId);
    this.logger.debug("listed agent sessions", { agentId, count: sessions.length });
    return sessions;
  }

  async getAgentSession(
    ctx: Context,
    agentId: string,
    sessionId: string
  ): Promise<AgentSession> {
    await this.requireOwnedAgent(ctx, agentId);
    const session = await this.db.getAgentSession(agentId, sessionId);
    this.logger.debug("got agent session events", { agentId, sessionId, count: session.events.length });
    return session;
  }

  // Agents live in the Runtime (Kubernetes), not the database — ownership is
  // verified there before any session data is read.
  private async requireOwnedAgent(ctx: Context, agentId: string): Promise<void> {
    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      throw new Error(`HermesAgent ${agentId} not found`);
    }
    this.verifyOwnership(ctx, agent);
  }
}