import type { AgentSessionEvent, AgentSessionEventBatch, AgentSessionSummary } from "@/entities";

export type AppendAgentSessionEventsInput = Pick<AgentSessionEventBatch, "sessionId" | "events"> & {
  agentId: string | null;
};

export interface Database {
  appendAgentSessionEvents(input: AppendAgentSessionEventsInput): Promise<number>;
  listAgentSessions(agentId: string): Promise<AgentSessionSummary[]>;
  getAgentSessionEvents(agentId: string, sessionId: string): Promise<AgentSessionEvent[]>;
}