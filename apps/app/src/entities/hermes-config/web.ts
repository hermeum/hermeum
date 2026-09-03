import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search
// Full field semantics: docs/hermes-config/web-search.md
//
// Skipped on purpose: web.extract_char_limit,
// web.keyless_fallback, and web.keyless_rescue are validated by looseObject
// pass-through, not typed here. The "nous" backend (managed Tool Gateway) is
// also omitted — it requires Nous Portal OAuth, which is not supported in
// container mode; it still passes through via looseObject if written by hand.
export const WebSearchBackendSchema = z
  .enum(["firecrawl", "searxng", "brave-free", "ddgs", "keenable", "exa", "parallel", "xai"])
  .describe("Web search backend.");

export type WebSearchBackend = z.infer<typeof WebSearchBackendSchema>;

export const WebExtractBackendSchema = z
  .enum(["firecrawl", "keenable", "exa", "parallel"])
  .describe("Web extract backend. Search-only backends are not allowed here.");

export type WebExtractBackend = z.infer<typeof WebExtractBackendSchema>;

export const WebSchema = z
  .looseObject({
    backend: WebSearchBackendSchema.optional().describe("Shared backend for search and extract."),
    search_backend: WebSearchBackendSchema.optional().describe("Backend for the web_search tool."),
    extract_backend: WebExtractBackendSchema.optional().describe("Backend for the web_extract tool."),
  })
  .optional()
  .describe("Web search & extract configuration.");

export type Web = z.infer<typeof WebSchema>;