import type {
  AgentSession,
  AgentSessionSummary,
  PaginatedResult,
  PaginationQuery,
} from "@/entities";

export type AppendAgentSessionEventsInput = Pick<AgentSession, "sessionId" | "events"> & {
  agentId: string;
};

export interface Database {
  appendAgentSessionEvents(input: AppendAgentSessionEventsInput): Promise<number>;
  listAgentSessionSummaries(
    agentId: string,
    query: PaginationQuery
  ): Promise<PaginatedResult<AgentSessionSummary>>;
  getAgentSession(agentId: string, sessionId: string): Promise<AgentSession>;

  // Per-agent plugin ingest tokens: only the SHA-256 digest is stored (see
  // libs/plugin-token). storeAgentToken upserts (re-provisioning an agent
  // replaces its token and clears any revocation); findAgentIdByTokenHash
  // returns null for unknown or revoked tokens.
  storeAgentToken(agentId: string, tokenHash: string): Promise<void>;
  findAgentIdByTokenHash(tokenHash: string): Promise<string | null>;
  revokeAgentToken(agentId: string): Promise<void>;
}