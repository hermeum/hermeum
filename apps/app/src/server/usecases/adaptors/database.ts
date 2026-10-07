import type { AgentSession, AgentSessionSummary } from "@/entities";

export type AppendAgentSessionEventsInput = Pick<AgentSession, "sessionId" | "events"> & {
  agentId: string | null;
};

export interface Database {
  appendAgentSessionEvents(input: AppendAgentSessionEventsInput): Promise<number>;
  listAgentSessionSummaries(agentId: string): Promise<AgentSessionSummary[]>;
  getAgentSession(agentId: string, sessionId: string): Promise<AgentSession>;
}