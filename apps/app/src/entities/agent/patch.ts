// Partial-update support for the agent config chat's `patchAgentConfig` tool.
//
// Merge semantics (described to the model in the tool description, mirrored
// here in `applyAgentPatch`):
// - Plain objects merge recursively.
// - `null` deletes the key (at any depth).
// - Arrays and scalars replace the current value wholesale.
// - Keys absent from the patch leave the draft untouched.
//
// The patch schema is deliberately untyped at the value level: field
// semantics and validation live in `AgentInputObjectSchema`/`AgentInputSchema`
// (present every turn via `replaceAgentConfig` and applied to the merged
// result). What it DOES declare is the top-level field names — an empty
// `looseObject({})` emitted `"properties": {}` to the model, which then had
// no visible keys to patch and sent `{}` (observed in the field). The nested
// shape is learned from `replaceAgentConfig`'s input schema, the embedded
// draft JSON, and the tool description's example.
import { z } from "zod";

import { AgentInputObjectSchema, type AgentInput } from "./schema";

// Top-level patch keys mirror `AgentInputObjectSchema`'s shape (derived, so
// they can't drift); values are `unknown` — the model sees the keys in the
// tool's JSON Schema and copies value shapes from `replaceAgentConfig`'s
// schema, while real validation happens on the merged result.
const patchShape = Object.fromEntries(
  Object.keys(AgentInputObjectSchema.shape).map((key) => [key, z.unknown().optional()])
) as {
  [K in keyof typeof AgentInputObjectSchema.shape]: z.ZodOptional<z.ZodUnknown>;
};

export const AgentPatchSchema = z.looseObject(patchShape).superRefine((patch, ctx) => {
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Patch must set at least one field.",
    });
    return;
  }
  for (const key of keys) {
    if (!(key in AgentInputObjectSchema.shape)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message:
          `Unknown top-level field "${key}". Use replaceAgentConfig for a ` +
          "full rewrite if the field is needed.",
      });
    }
  }
});

export type AgentPatch = z.infer<typeof AgentPatchSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergePatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
      continue;
    }
    const existing = result[key];
    result[key] =
      isPlainObject(value) && isPlainObject(existing)
        ? mergePatch(existing, value)
        : value;
  }
  return result;
}

// Deep-merge `patch` onto `current` per the semantics above. Pure: neither
// input is mutated and a fresh object is returned. `undefined` current seeds
// a new draft from the patch alone.
export function applyAgentPatch(
  current: AgentInput | undefined,
  patch: AgentPatch
): Record<string, unknown> {
  return mergePatch(current === undefined ? {} : { ...current }, patch);
}