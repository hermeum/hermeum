import type {
  AgentSession,
  AgentSessionSummary,
  PaginatedResult,
  PaginationQuery,
} from "@/entities";

export type AppendAgentSessionEventsInput = Pick<AgentSession, "sessionId" | "events"> & {
  agentId: string | null;
};

export interface Database {
  appendAgentSessionEvents(input: AppendAgentSessionEventsInput): Promise<number>;
  listAgentSessionSummaries(
    agentId: string,
    query: PaginationQuery
  ): Promise<PaginatedResult<AgentSessionSummary>>;
  getAgentSession(agentId: string, sessionId: string): Promise<AgentSession>;
}