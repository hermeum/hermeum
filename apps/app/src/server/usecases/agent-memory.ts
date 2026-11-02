import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { AgentMemoryEntry, Context } from "@/entities";

import { BaseUseCase, OwnershipGuarded } from "./mixin";

// Hermeum-managed agent memory. The agent-facing tool mirrors hermes-agent's
// native `memory` tool (vendor/hermes-agent/tools/memory_tool.py and
// memory_tool_store.py): add / patch / remove operations, applied atomically as
// one `operations` batch, with short unique substring matching and the same
// result payloads and error messages. The plugin always calls the batch
// procedure (a drifted top-level single-op tool call is translated into a
// one-op batch there), so this use case exposes just `read` + `batch`.
//
// Differences from the native tool, all deliberate:
//
// - `target` is always "memory": Hermeum has one store per agent and does not
//   manage USER.md.
// - No character budget (the PoC has no limits), so `usage` fields and the
//   consolidation/overflow paths are absent.
// - No write-approval staging, background-review gate, threat-pattern scan, or
//   file drift guard — none of those apply to a server-side store. The scan is
//   the one native behavior worth restoring before production (entries reach
//   the model through prefetch), noted as a follow-up.
//
// Operation inputs and result payloads live here, not in entities: they are
// this use case's contract (the router imports them), the same boundary as
// ListAgentsFilterSchema in usecases/agent.ts. The entity (entities/
// agent-memory.ts) holds only the stored entry; persistence is the Database
// adaptor's listMemoryEntries/saveMemoryEntries (an id-keyed atomic save:
// unchanged entries keep their row, dropped entries are deleted).

const PATCH_DROP_HINT =
  "To drop text inside an entry, patch a longer span that contains it; 'remove' deletes the whole entry.";

const BATCH_ALL_OR_NOTHING = " No operations were applied (batch is all-or-nothing).";

export const AgentMemoryOperationSchema = z.object({
  action: z.enum(["add", "patch", "remove"]),
  content: z.string().optional().describe("Required for 'add' and 'patch'."),
  oldText: z.string().optional().describe("Required for 'patch' and 'remove'."),
});
export type AgentMemoryOperation = z.infer<typeof AgentMemoryOperationSchema>;

export const AgentMemoryBatchInputSchema = z.object({
  operations: z.array(AgentMemoryOperationSchema).min(1).describe("Operations applied atomically."),
});
export type AgentMemoryBatchInput = z.infer<typeof AgentMemoryBatchInputSchema>;

const AgentMemorySuccessSchema = z.object({
  success: z.literal(true),
  done: z.literal(true),
  target: z.literal("memory"),
  entryCount: z.number().int().nonnegative(),
  message: z.string().optional(),
});

const AgentMemoryFailureSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  matches: z.array(z.string()).optional().describe("Ambiguous-match previews (80 chars each)."),
  closestEntries: z.array(z.string()).optional().describe("Best-effort near matches for a no-match error."),
});

export const AgentMemoryResultSchema = z.discriminatedUnion("success", [
  AgentMemorySuccessSchema,
  AgentMemoryFailureSchema,
]);
export type AgentMemoryResult = z.infer<typeof AgentMemoryResultSchema>;

function successResult(entryCount: number, message?: string): AgentMemoryResult {
  return {
    success: true,
    done: true,
    target: "memory",
    entryCount,
    ...(message !== undefined ? { message } : {}),
  };
}

function failure(
  error: string,
  extra: { matches?: string[]; closestEntries?: string[] } = {}
): AgentMemoryResult {
  return {
    success: false,
    error,
    ...(extra.matches !== undefined ? { matches: extra.matches } : {}),
    ...(extra.closestEntries !== undefined ? { closestEntries: extra.closestEntries } : {}),
  };
}

function preview(entry: string): string {
  return entry.length > 80 ? `${entry.slice(0, 80)}...` : entry;
}

// Overlapping occurrences included, like the native store: "00" occurs twice
// in "1000".
function spanOccurrences(text: string, span: string): number {
  let count = 0;
  for (let index = 0; index <= text.length - span.length; index += 1) {
    if (text.startsWith(span, index)) {
      count += 1;
    }
  }
  return count;
}

function tokenSet(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

// Native _no_match_error's closest_entries: entries sharing at least 30% of
// old_text's tokens, best overlap first (ties keep store order), capped at 3.
function closestEntries(entries: string[], oldText: string): string[] {
  const wanted = tokenSet(oldText);
  if (wanted.size === 0) {
    return [];
  }
  return entries
    .map((entry, index) => {
      const tokens = tokenSet(entry);
      let shared = 0;
      for (const token of wanted) {
        if (tokens.has(token)) {
          shared += 1;
        }
      }
      return { entry, index, score: shared / wanted.size };
    })
    .filter((candidate) => candidate.score >= 0.3)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3)
    .map((candidate) => candidate.entry);
}

type LocateResult = { index: number } | { ambiguous: string[] } | { missing: true };

// Native _find_unique_match: a whole-entry exact match wins over substring
// matches; distinct matches are ambiguous; exact duplicates resolve to the
// first.
function findUniqueMatch(entries: string[], oldText: string): LocateResult {
  const exact = entries.flatMap((entry, index) => (entry === oldText ? [index] : []));
  const matches =
    exact.length > 0
      ? exact
      : entries.flatMap((entry, index) => (entry.includes(oldText) ? [index] : []));
  if (new Set(matches.map((index) => entries[index])).size > 1) {
    return { ambiguous: matches.map((index) => preview(entries[index]!)) };
  }
  return matches.length > 0 ? { index: matches[0]! } : { missing: true };
}

export class AgentMemoryUseCase extends OwnershipGuarded(BaseUseCase) {
  // Operator-facing operations (the agent detail Memory tab): ownership-
  // guarded, id-addressed. The agent-facing plugin path below (read / batch) is
  // ctx-less — it is reached only through the token-authenticated plugin
  // protocol, where the agent identity comes from the ingest token.
  async listEntries(ctx: Context, agentId: string): Promise<AgentMemoryEntry[]> {
    await this.#authorize(ctx, agentId);
    return await this.read(agentId);
  }

  async addEntry(ctx: Context, agentId: string, content: string): Promise<AgentMemoryEntry[]> {
    await this.#authorize(ctx, agentId);
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error("Memory entry content cannot be empty.");
    }
    // Exact duplicates are a no-op, matching the memory tool's semantics.
    const entries = await this.read(agentId);
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
    return await this.read(agentId);
  }

  async removeEntry(ctx: Context, agentId: string, id: string): Promise<AgentMemoryEntry[]> {
    await this.#authorize(ctx, agentId);
    const removed = await this.db.removeMemoryEntry(agentId, id);
    if (!removed) {
      throw new Error("Memory entry not found.");
    }
    this.logger.info("agent memory entry removed (operator)", { agentId, id });
    return await this.read(agentId);
  }

  async read(agentId: string): Promise<AgentMemoryEntry[]> {
    return await this.db.listMemoryEntries(agentId);
  }

  async batch(agentId: string, input: AgentMemoryBatchInput): Promise<AgentMemoryResult> {
    const operations = input.operations;
    if (operations.length === 0) {
      return failure(`operations list is empty.${BATCH_ALL_OR_NOTHING}`);
    }
    // Batch aborts omit the current inventory (the caller already holds it);
    // zero-match ops carry closest_entries instead.
    const batchFailure = (error: string, closest?: string[]): AgentMemoryResult =>
      failure(
        `${error}${BATCH_ALL_OR_NOTHING}`,
        closest && closest.length > 0 ? { closestEntries: closest } : {}
      );

    const entries = await this.read(agentId);
    const working = entries.map((entry) => ({ ...entry }));

    for (const [index, operation] of operations.entries()) {
      const action = operation.action;
      const content = operation.content ?? "";
      const oldText = operation.oldText ?? "";
      const position = `Operation ${index + 1} (${action})`;
      const now = new Date().toISOString();

      if (action === "add") {
        const trimmed = content.trim();
        if (!trimmed) {
          return batchFailure(`${position}: content is required.`);
        }
        // Idempotent: a duplicate add is skipped, not a batch failure.
        if (!working.some((entry) => entry.content === trimmed)) {
          working.push({
            id: randomUUID(),
            agentId,
            content: trimmed,
            createdAt: now,
            updatedAt: now,
          });
        }
        continue;
      }

      if (action !== "patch" && action !== "remove") {
        return batchFailure(`${position}: unknown action. Use add, patch, or remove.`);
      }
      if (!oldText.trim()) {
        return batchFailure(`${position}: old_text is required.`);
      }
      if (action === "patch" && !content.trim()) {
        return batchFailure(
          `${position}: content is required — set this operation object's own 'content' to the new ` +
            `text for the old_text span. ${PATCH_DROP_HINT}`
        );
      }

      // Whole-entry actions strip their locator; a patch span keeps its whitespace.
      const locator = action === "patch" ? oldText : oldText.trim();
      const contents = working.map((entry) => entry.content);
      const located = findUniqueMatch(contents, locator);
      if ("ambiguous" in located) {
        return batchFailure(
          `${position}: '${locator}' matched multiple distinct entries -- be more specific.`
        );
      }
      if ("missing" in located) {
        const closest = closestEntries(contents, locator);
        const hint = locator.includes("§")
          ? " old_text must come from ONE entry ('§' separates entries); use one op per entry."
          : "";
        return batchFailure(
          `${position}: No entry matched '${locator}'.${hint} Retry with old_text copied verbatim ` +
            `from the intended entry${closest.length > 0 ? " (closest_entries below)." : "."}`,
          closest
        );
      }

      const target = working[located.index]!;
      if (action === "remove") {
        working.splice(located.index, 1);
        continue;
      }

      const occurrences = spanOccurrences(target.content, locator);
      if (occurrences > 1) {
        return batchFailure(
          `${position}: '${locator}' appears ${occurrences} times in the matched entry, and patch ` +
            "edits one span. Include more surrounding text so old_text occurs once."
        );
      }
      const patched = target.content.replace(locator, content);
      if (patched === target.content) {
        return batchFailure(
          `${position}: Patch is a no-op: '${locator}' -> '${content}' leaves the entry unchanged.`
        );
      }
      target.content = patched;
      target.updatedAt = now;
    }

    // Native guard (#103419): a consolidation batch must not empty a previously
    // non-empty store; a deliberate final delete is a one-op remove.
    if (
      entries.length > 0 &&
      working.length === 0 &&
      !(operations.length === 1 && operations[0]!.action === "remove")
    ) {
      return batchFailure(
        "Refusing to empty memory: this batch would remove every entry from a previously " +
          "non-empty store. Keep at least one entry — merge overlapping entries into a shorter " +
          "one instead of removing the last one. To delete the final entry deliberately, remove " +
          "it alone in a one-item batch."
      );
    }

    await this.db.saveMemoryEntries(agentId, working);
    this.logger.info("agent memory batch applied", {
      agentId,
      operations: operations.length,
      entryCount: working.length,
    });
    return successResult(working.length, `Applied ${operations.length} operation(s).`);
  }

  // Operator writes require ownership of the agent; the runtime lookup supplies
  // the userId the Resources router's session is checked against.
  async #authorize(ctx: Context, agentId: string): Promise<void> {
    const agent = await this.runtime.getHermesAgent(agentId);
    if (!agent) {
      throw new Error(`HermesAgent ${agentId} not found`);
    }
    this.verifyOwnership(ctx, agent);
  }
}
