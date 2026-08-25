import { z } from "zod";

// https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search
// Full field semantics: docs/hermes-config/web-search.md
export const WebSearchBackendSchema = z
  .enum(["firecrawl", "searxng", "brave-free", "ddgs", "tavily", "exa", "parallel", "xai"])
  .describe("Web search backend.");

export type WebSearchBackend = z.infer<typeof WebSearchBackendSchema>;

export const WebExtractBackendSchema = z
  .enum(["firecrawl", "tavily", "exa", "parallel"])
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