import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { AgentMemoryEntry } from "@/entities";

import type { MemoryStore } from "./adaptors/memory";
import { BaseUseCase, sharedMemoryStore } from "./mixin";

// Hermeum-managed agent memory. The agent-facing tool mirrors hermes-agent's
// native `memory` tool (vendor/hermes-agent/tools/memory_tool.py and
// memory_tool_store.py): actions add / patch / remove, batch `operations`
// applied atomically, short unique substring matching, the same result
// payloads and error messages. Differences, all deliberate:
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
// agent-memory.ts) holds only the stored entry.

const PATCH_DROP_HINT =
  "To drop text inside an entry, patch a longer span that contains it; 'remove' deletes the whole entry.";

// Legacy 'replace' (removed upstream) — the model-facing message mirrors the
// native tool's, so a replayed transcript gets the same actionable error.
const REPLACE_REMOVED =
  "'replace' is not available; use 'patch'. old_text is the exact span to change and " +
  "content is its new text; the rest of the entry is kept. To rewrite a whole entry, " +
  "set old_text to the whole entry. Nothing was written.";

const BATCH_ALL_OR_NOTHING = " No operations were applied (batch is all-or-nothing).";

export const AgentMemoryAddInputSchema = z.object({
  content: z.string().describe("The new memory entry."),
});
export type AgentMemoryAddInput = z.infer<typeof AgentMemoryAddInputSchema>;

export const AgentMemoryPatchInputSchema = z.object({
  oldText: z
    .string()
    .describe(
      "Span inside exactly one entry to replace; must occur once in that entry. " +
        "Pass the whole entry to rewrite it."
    ),
  content: z.string().describe("Replacement text for oldText; the rest of the entry is kept."),
});
export type AgentMemoryPatchInput = z.infer<typeof AgentMemoryPatchInputSchema>;

export const AgentMemoryRemoveInputSchema = z.object({
  oldText: z.string().describe("Short unique substring identifying the entry to delete."),
});
export type AgentMemoryRemoveInput = z.infer<typeof AgentMemoryRemoveInputSchema>;

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
  currentEntries: z
    .array(z.string())
    .optional()
    .describe("Live inventory for single-op no-match errors; batch aborts omit it."),
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
  extra: {
    matches?: string[];
    closestEntries?: string[];
    currentEntries?: string[];
  } = {}
): AgentMemoryResult {
  return {
    success: false,
    error,
    ...(extra.matches !== undefined ? { matches: extra.matches } : {}),
    ...(extra.closestEntries !== undefined ? { closestEntries: extra.closestEntries } : {}),
    ...(extra.currentEntries !== undefined ? { currentEntries: extra.currentEntries } : {}),
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

function noMatchError(entries: string[], oldText: string, verb: string): AgentMemoryResult {
  const closest = closestEntries(entries, oldText);
  const hint = oldText.includes("§")
    ? " old_text must come from ONE entry ('§' separates entries); use one op per entry."
    : "";
  const error =
    `No entry matched '${oldText}'.${hint} Retry the ${verb} with old_text copied verbatim ` +
    `from the intended entry${closest.length > 0 ? " (closest_entries below)." : "."}`;
  return failure(error, {
    currentEntries: entries,
    ...(closest.length > 0 ? { closestEntries: closest } : {}),
  });
}

export class AgentMemoryUseCase extends BaseUseCase {
  constructor(readonly memory: MemoryStore = sharedMemoryStore) {
    super();
  }

  async read(agentId: string): Promise<AgentMemoryEntry[]> {
    return await this.memory.listEntries(agentId);
  }

  async add(agentId: string, input: AgentMemoryAddInput): Promise<AgentMemoryResult> {
    const content = input.content.trim();
    if (!content) {
      return failure("Content cannot be empty.");
    }
    const entries = await this.read(agentId);
    if (entries.some((entry) => entry.content === content)) {
      return successResult(entries.length, "Entry already exists (no duplicate added).");
    }
    const now = new Date().toISOString();
    const next = [
      ...entries,
      { id: randomUUID(), agentId, content, createdAt: now, updatedAt: now } satisfies AgentMemoryEntry,
    ];
    await this.memory.saveEntries(agentId, next);
    this.logger.info("agent memory entry added", { agentId, entryCount: next.length });
    return successResult(next.length, "Entry added.");
  }

  async patch(agentId: string, input: AgentMemoryPatchInput): Promise<AgentMemoryResult> {
    // Native keeps the span's whitespace; only whole-entry actions strip.
    if (!input.oldText.trim()) {
      return failure("old_text cannot be empty.");
    }
    if (!input.content.trim()) {
      return failure(
        `content (the new text for the old_text span) is required for 'patch' action. ${PATCH_DROP_HINT}`
      );
    }
    const entries = await this.read(agentId);
    const contents = entries.map((entry) => entry.content);
    const located = findUniqueMatch(contents, input.oldText);
    if ("ambiguous" in located) {
      return failure(`Multiple entries matched '${input.oldText}'. Be more specific.`, {
        matches: located.ambiguous,
      });
    }
    if ("missing" in located) {
      return noMatchError(contents, input.oldText, "patch");
    }
    const target = entries[located.index]!;
    const occurrences = spanOccurrences(target.content, input.oldText);
    if (occurrences > 1) {
      return failure(
        `'${input.oldText}' appears ${occurrences} times in the matched entry, and patch edits ` +
          "one span. Include more surrounding text so old_text occurs once."
      );
    }
    const patched = target.content.replace(input.oldText, input.content);
    if (patched === target.content) {
      return failure(
        `Patch is a no-op: '${input.oldText}' -> '${input.content}' leaves the entry unchanged.`
      );
    }
    const now = new Date().toISOString();
    const next = entries.map((entry, index) =>
      index === located.index ? { ...entry, content: patched, updatedAt: now } : entry
    );
    await this.memory.saveEntries(agentId, next);
    this.logger.info("agent memory entry patched", { agentId, entryCount: next.length });
    return successResult(next.length, "Entry patched.");
  }

  async remove(agentId: string, input: AgentMemoryRemoveInput): Promise<AgentMemoryResult> {
    const oldText = input.oldText.trim();
    if (!oldText) {
      return failure("old_text cannot be empty.");
    }
    const entries = await this.read(agentId);
    const contents = entries.map((entry) => entry.content);
    const located = findUniqueMatch(contents, oldText);
    if ("ambiguous" in located) {
      return failure(`Multiple entries matched '${oldText}'. Be more specific.`, {
        matches: located.ambiguous,
      });
    }
    if ("missing" in located) {
      return noMatchError(contents, oldText, "remove");
    }
    const next = entries.filter((_, index) => index !== located.index);
    await this.memory.saveEntries(agentId, next);
    this.logger.info("agent memory entry removed", { agentId, entryCount: next.length });
    return successResult(next.length, "Entry removed.");
  }

  async batch(agentId: string, input: AgentMemoryBatchInput): Promise<AgentMemoryResult> {
    const operations = input.operations;
    if (operations.length === 0) {
      return failure(`operations list is empty.${BATCH_ALL_OR_NOTHING}`);
    }
    // Batch aborts omit current_entries (the caller already holds the
    // inventory); zero-match ops carry closest_entries instead.
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

    await this.memory.saveEntries(agentId, working);
    this.logger.info("agent memory batch applied", {
      agentId,
      operations: operations.length,
      entryCount: working.length,
    });
    return successResult(working.length, `Applied ${operations.length} operation(s).`);
  }
}

// Legacy single-op 'replace' — rejected with the native message. The tool
// schema does not advertise it; this only catches replayed transcripts.
export function replacedActionError(): AgentMemoryResult {
  return failure(REPLACE_REMOVED);
}
