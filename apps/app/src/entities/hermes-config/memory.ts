import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
// Full field semantics: docs/official/memory.md
//
// Hermeum pins only the provider: agent memory is operator-authored in Hermeum,
// so `provider` is fixed to "hermeum" (an explicit different value fails
// validation, and the HermeumMemory managed aspect injects it when the memory
// block is absent). The external provider is additive upstream — it gives the
// agent the context its creators curated; it does not replace the built-in
// stores.
//
// Skipped on purpose: memory_enabled, user_profile_enabled, memory_char_limit,
// user_char_limit, write_approval, nudge_interval, and prefetch_spill_enabled
// are not typed here — they pass through via looseObject and stay
// operator-controlled.
export const MemorySchema = z
  .looseObject({
    provider: z
      .literal("hermeum")
      .optional()
      .describe(
        "Memory provider — fixed to 'hermeum'. Hermeum-managed agents receive operator-authored memory as context."
      ),
  })
  .optional()
  .describe("Persistent memory. The provider is fixed to Hermeum.");

export type Memory = z.infer<typeof MemorySchema>;
