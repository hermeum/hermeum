import { createServerFn } from "@tanstack/react-start/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@kubebox/trpc/server";

/**
 * tRPC batch handler exposed as a server function.
 * The tRPC client is configured to POST to /trpc (see trpc.ts).
 */
export const trpcHandler = createServerFn({ method: "POST" })
  .validator((data: Request) => data)
  .handler(({ data: request }) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: request,
      router: appRouter,
      createContext: () => createContext(),
    })
  );
