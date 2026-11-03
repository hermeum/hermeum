import type {
  AgentMemoryEntry,
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
  // Session-granular retention: deletes every event of each session whose
  // most recent event (by created_at) is older than cutoff. Implementations
  // batch by session so a run never holds long transactions, and the staleness
  // predicate is self-contained (re-evaluated at delete time) so a session
  // that receives new events during the run is spared. Returns the total
  // number of event rows deleted.
  deleteAgentSessionsLastActiveBefore(cutoff: Date): Promise<number>;

  // Per-agent plugin ingest tokens: only the SHA-256 digest is stored (see
  // libs/plugin-token). storeAgentToken upserts (re-provisioning an agent
  // replaces its token, stamps updatedAt as a rotation trail, and clears any
  // revocation); findAgentIdByTokenHash returns null for unknown or revoked
  // tokens.
  storeAgentToken(agentId: string, tokenHash: string): Promise<void>;
  findAgentIdByTokenHash(tokenHash: string): Promise<string | null>;
  revokeAgentToken(agentId: string): Promise<void>;

  // Hermeum-managed agent memory (the hermeum memory provider). One store per
  // agent; entries are operator-authored and read-only to the agent.
  // listMemoryEntries returns the agent's entries in list order (the position
  // column preserves it). Writes are single-row statements — no full-list
  // replace: addMemoryEntry appends (the adaptor computes the next position)
  // and stamps both timestamps with the database clock; patchMemoryEntry
  // returns null when no row matched; removeMemoryEntry returns false when no
  // row matched (the use case turns those into not-found errors). Position gaps
  // left by removes are harmless — reads order by position.
  listMemoryEntries(agentId: string): Promise<AgentMemoryEntry[]>;
  addMemoryEntry(
    agentId: string,
    entry: Pick<AgentMemoryEntry, "id" | "content">
  ): Promise<AgentMemoryEntry>;
  patchMemoryEntry(agentId: string, id: string, content: string): Promise<AgentMemoryEntry | null>;
  removeMemoryEntry(agentId: string, id: string): Promise<boolean>;
}
