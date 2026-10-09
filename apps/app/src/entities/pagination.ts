import { z } from "zod";

// Shared offset-based pagination shapes, usable by any paginated list in the
// system. Defaults are owned by the caller (e.g. the UI) — adaptors and use
// cases receive a fully populated `PaginationQuery`.
export const PaginationQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(100).describe("Page size."),
    offset: z.number().int().min(0).describe("Number of items to skip."),
  })
  .describe("Offset-based page request for a paginated list.");

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginatedResultSchema = <T extends z.ZodTypeAny>(item: T) =>
  z
    .object({
      items: z.array(item).describe("One page of results."),
      hasMore: z.boolean().describe("Whether a next page exists beyond `items`."),
    })
    .describe("One page of a paginated list.");

export type PaginatedResult<T> = { items: T[]; hasMore: boolean };