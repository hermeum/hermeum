import { Document, Scalar } from "yaml";

import type { AgentInput } from "@/entities";

// Renders `soul` as a literal block (`|`) instead of yaml's default folded
// style (`>-`), which collapses newlines into blank-line-separated runs and
// hard-wraps lines — unreadable for multi-paragraph markdown.
export function stringifyAgentInput(input: AgentInput): string {
  const doc = new Document(input);
  const soul = doc.get("soul", true);
  if (soul instanceof Scalar && typeof soul.value === "string") {
    soul.type = Scalar.BLOCK_LITERAL;
  }
  return doc.toString().trim();
}
