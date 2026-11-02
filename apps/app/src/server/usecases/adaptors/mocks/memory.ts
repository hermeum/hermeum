import type { AgentMemoryEntry } from "@/entities";

import type { MemoryStore } from "../memory";

// In-memory MemoryStore for the agent-memory PoC. Entries live per process and
// are lost on restart; the database-backed adaptor replaces this when memory
// persistence lands. Copies are handed in and out so callers can never mutate
// the stored list through a shared reference.
export class InMemoryMemoryStore implements MemoryStore {
  readonly #byAgent = new Map<string, AgentMemoryEntry[]>();

  async listEntries(agentId: string): Promise<AgentMemoryEntry[]> {
    return (this.#byAgent.get(agentId) ?? []).map((entry) => ({ ...entry }));
  }

  async saveEntries(agentId: string, entries: AgentMemoryEntry[]): Promise<void> {
    this.#byAgent.set(
      agentId,
      entries.map((entry) => ({ ...entry }))
    );
  }
}
