import { z } from "zod";

// Framework-neutral tool port consumed by use cases. Adapters at the router
// boundary convert these into a specific AI library's tool representation; use
// cases never import a framework directly. Zod remains the schema language
// (project standard — field semantics live in `.describe()` texts).

export interface ToolExecutionOptions {
  signal?: AbortSignal;
}

// Defaults are `any` (not `unknown`) so a specific `Tool<SpecificInput, X>`
// stays assignable to `ToolSet`'s element type: `any` makes the `execute`
// parameter bivariant, sidestepping the contravariance that bites `unknown`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Tool<INPUT = any, OUTPUT = any> {
  description?: string;
  inputSchema: z.ZodType<INPUT>;
  execute?: (
    input: INPUT,
    options: ToolExecutionOptions
  ) => Promise<OUTPUT> | OUTPUT;
}

export type ToolSet = Record<string, Tool>;

// Factory preserving inference ergonomics: INPUT is inferred from
// `inputSchema`, OUTPUT from `execute`'s return type (defaulting to `never` for
// client-side tools that omit `execute`).
export function tool<INPUT, OUTPUT = never>(t: {
  description?: string;
  inputSchema: z.ZodType<INPUT>;
  execute?: (
    input: INPUT,
    options: ToolExecutionOptions
  ) => Promise<OUTPUT> | OUTPUT;
}): Tool<INPUT, OUTPUT> {
  return t;
}