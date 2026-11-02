import { randomUUID } from "node:crypto";

import type { AgentMemoryEntry, Context } from "@/entities";

import { BaseUseCase, OwnershipGuarded } from "./mixin";

// Hermeum-managed agent memory. Entries are operator-authored context: the
// agent reads them through the hermeum memory provider's prefetch (token-
// authenticated, read-only), while the agent detail page's Memory tab owns
// writes (owner-guarded add / patch / remove).
//
// Keeping writes off the agent path is deliberate. The external provider is
// additive upstream, not a replacement, so it exists to give the agent the
// context its creators curated — not to let the agent grow the store without
// bound. Only operators add, patch, and remove entries.
//
// Persistence is the Database adaptor: listMemoryEntries / the id-keyed
// saveMemoryEntries batch path is gone; single-row add/patch/remove statements
// stamp their own timestamps (the database's clock).

export class AgentMemoryUseCase extends OwnershipGuarded(BaseUseCase) {
  // -- Operator-facing operations (the agent detail Memory tab) ------------
  // Ownership-guarded, id-addressed. The agent-facing read below is ctx-less.

  async listEntries(ctx: Context, agentId: string): Promise<AgentMemoryEntry[]> {
    await this.#authorize(ctx, agentId);
    return await this.db.listMemoryEntries(agentId);
  }

  async addEntry(ctx: Context, agentId: string, content: string): Promise<AgentMemoryEntry[]> {
    await this.#authorize(ctx, agentId);
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Memory entry content cannot be empty.");
    }
    // Exact duplicates are a no-op, keeping the store stable.
    const entries = await this.db.listMemoryEntries(agentId);
    if (entries.some((entry) => entry.content === trimmed)) {
      return entries;
    }
    // The adaptor stamps createdAt/updatedAt with the database clock and
    // returns the stored row.
    const stored = await this.db.addMemoryEntry(agentId, {
      id: randomUUID(),
      content: trimmed,
    });
    this.logger.info("agent memory entry added (operator)", {
      agentId,
      entryCount: entries.length + 1,
    });
    return [...entries, stored];
  }

  async patchEntry(
    ctx: Context,
    agentId: string,
    id: string,
    content: string
  ): Promise<AgentMemoryEntry[]> {
    await this.#authorize(ctx, agentId);
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Memory entry content cannot be empty.");
    }
    // The adaptor stamps updatedAt with the database clock.
    const updated = await this.db.patchMemoryEntry(agentId, id, trimmed);
    if (!updated) {
      throw new Error("Memory entry not found.");
    }
    this.logger.info("agent memory entry patched (operator)", { agentId, id });
    return await this.db.listMemoryEntries(agentId);
  }

  async removeEntry(ctx: Context, agentId: string, id: string): Promise<AgentMemoryEntry[]> {
    await this.#authorize(ctx, agentId);
    const removed = await this.db.removeMemoryEntry(agentId, id);
    if (!removed) {
      throw new Error("Memory entry not found.");
    }
    this.logger.info("agent memory entry removed (operator)", { agentId, id });
    return await this.db.listMemoryEntries(agentId);
  }

  // -- Agent-facing path (token-authenticated plugin protocol) -------------
  // Read-only: the provider only needs the entries for prefetch. No ctx — the
  // plugin protocol resolves the agent from its ingest token.

  async readForAgent(agentId: string): Promise<AgentMemoryEntry[]> {
    return await this.db.listMemoryEntries(agentId);
  }

  // Operator operations require ownership of the agent; the runtime lookup
  // supplies the userId the Resources router's session is checked against.
  async #authorize(ctx: Context, agentId: string): Promise<void> {
    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      throw new Error(`HermesAgent ${agentId} not found`);
    }
    this.verifyOwnership(ctx, agent);
  }
}
