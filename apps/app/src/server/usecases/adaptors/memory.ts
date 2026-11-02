import type { AgentMemoryEntry } from "@/entities";

// Persistence for Hermeum-managed agent memory. The native hermes-agent store
// (vendor/hermes-agent/tools/memory_tool_store.py) rewrites MEMORY.md
// wholesale; this adaptor keeps that shape — read the entry list, mutate it in
// the use case, save the result — so the matching/edit rules live in the use
// case, not the store. The PoC ships an in-memory implementation; a
// database-backed adaptor replaces it without touching the use case.
export interface MemoryStore {
  listEntries(agentId: string): Promise<AgentMemoryEntry[]>;
  /** Replace the agent's full entry list atomically. */
  saveEntries(agentId: string, entries: AgentMemoryEntry[]): Promise<void>;
}
