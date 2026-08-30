import { z } from "zod";

// Skill entity: identifier validation (shared by agent configs), plus the
// picker-facing summary shape the skill index adaptor projects entries to.
// The raw index entry stays infra-internal (snake_case, upstream-shaped).

// https://hermes-agent.nousresearch.com/docs/user-guide/features/skills#supported-hub-sources
const SKILL_SOURCE_PREFIXES = [
  "official/",
  "skills-sh/",
  "browse-sh/",
  "clawhub/",
  "lobehub/",
  "claude-marketplace/",
] as const;

const SKILL_NAMESPACE_PREFIXES = ["npm:", "pack:"] as const;

const SIMPLE_SLUG_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const PATH_SEGMENT_RE = /^[a-zA-Z0-9.][a-zA-Z0-9._-]*$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateSkillIdentifier(s: string, ctx: z.RefinementCtx): void {
  if (s.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "Skill identifier cannot be empty.",
      path: [],
    });
    return;
  }

  // Prefixed namespace forms: "npm:@scope/pkg", "pack:./local/skill"
  const nsPrefix = SKILL_NAMESPACE_PREFIXES.find((p) => s.startsWith(p));
  if (nsPrefix !== undefined) {
    const rest = s.slice(nsPrefix.length);
    if (rest.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: `Skill cannot be a bare "${nsPrefix}" prefix — a package identifier must follow.`,
        path: [],
      });
    } else if (!/^[^\s]+$/.test(rest)) {
      ctx.addIssue({
        code: "custom",
        message: `Skill "${s}" has whitespace in the package specifier after "${nsPrefix}".`,
        path: [],
      });
    }
    return;
  }

  // URL form: "well-known:<url>" or a bare http(s) URL
  if (s.startsWith("well-known:")) {
    const rest = s.slice("well-known:".length);
    if (!isHttpUrl(rest)) {
      ctx.addIssue({
        code: "custom",
        message:
          'well-known: skills must be followed by a valid http(s) URL, e.g. ' +
          '"well-known:https://mintlify.com/docs/.well-known/skills/mintlify".',
        path: [],
      });
    }
    return;
  }

  if (s.startsWith("http://") || s.startsWith("https://")) {
    if (!isHttpUrl(s)) {
      ctx.addIssue({
        code: "custom",
        message: "Direct-URL skills must be valid http(s) URLs.",
        path: [],
      });
    }
    return;
  }

  // Source-prefixed path forms: "official/...", "skills-sh/...", etc.
  const srcPrefix = SKILL_SOURCE_PREFIXES.find((p) => s.startsWith(p));
  if (srcPrefix !== undefined) {
    const rest = s.slice(srcPrefix.length);
    if (rest.length === 0) {
      ctx.addIssue({
        code: "custom",
        message:
          `Skill cannot be a bare "${srcPrefix}" prefix — at least two path segments must follow, ` +
          `e.g. "${srcPrefix}category/skill-name".`,
        path: [],
      });
      return;
    }
    const segments = rest.split("/");
    if (segments.length < 2) {
      ctx.addIssue({
        code: "custom",
        message:
          `Skill "${s}" needs at least two path segments after "${srcPrefix}", ` +
          `e.g. "${srcPrefix}category/skill-name".`,
        path: [],
      });
      return;
    }
    const bad = segments.find((seg) => !PATH_SEGMENT_RE.test(seg));
    if (bad !== undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          `Skill "${s}" has an invalid path segment "${bad}" after "${srcPrefix}". ` +
          'Segments must start with an alphanumeric character (or "." for hidden dirs) and may contain alphanumerics, ".", "-", and "_".',
        path: [],
      });
    }
    return;
  }

  // GitHub-style path: "owner/repo/..." — ≥2 non-empty segments
  if (s.includes("/")) {
    if (s.startsWith("/") || s.endsWith("/")) {
      ctx.addIssue({
        code: "custom",
        message: 'Skill paths must not start or end with "/", e.g. "openai/skills/k8s".',
        path: [],
      });
      return;
    }
    const segments = s.split("/");
    const bad = segments.find((seg) => !PATH_SEGMENT_RE.test(seg));
    if (bad !== undefined) {
      ctx.addIssue({
        code: "custom",
        message:
          `Skill "${s}" has an invalid path segment "${bad}". ` +
          'Segments must start with an alphanumeric character (or "." for hidden dirs) and may contain alphanumerics, ".", "-", and "_".',
        path: [],
      });
      return;
    }
    // ≥2 well-formed segments is a valid GitHub-style install path
    return;
  }

  // Simple slug — the only no-slash form we accept
  if (SIMPLE_SLUG_RE.test(s)) return;

  ctx.addIssue({
    code: "custom",
    message:
      `Skill "${s}" is not a recognized identifier format. Expected a simple slug ("axolotl"), ` +
      'a namespace prefix ("npm:@scope/pkg"), a hub-source path ("official/category/skill-name", ' +
      '"skills-sh/owner/repo/skill", "browse-sh/host/task-id"), a GitHub path ("openai/skills/k8s"), ' +
      'a well-known endpoint ("well-known:https://example.com/.well-known/skills/x"), or a direct URL ' +
      '("https://example.com/SKILL.md").',
    path: [],
  });
}

export const SkillIdentifierSchema = z
  .string()
  .min(1)
  .max(128, "Skill exceeds maximum length of 128 characters")
  .superRefine(validateSkillIdentifier);

export type SkillIdentifier = string;

export const SkillIdentifiersSchema = z
  .array(SkillIdentifierSchema)
  .max(20)
  .optional()
  .describe("Skill identifiers to install.");

export type SkillIdentifiers = z.infer<typeof SkillIdentifiersSchema>;

// Picker-facing projection of a skill index entry: only the fields the UI
// renders, camelCase. The infra adaptor maps its raw upstream entries to this.
export const SkillSummarySchema = z.object({
  name: z.string(),
  identifier: z.string(),
  description: z.string(),
});

export type SkillSummary = z.infer<typeof SkillSummarySchema>;