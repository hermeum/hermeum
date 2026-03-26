import { createAPIFileRoute } from "@tanstack/react-start/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "@kubebox/trpc/server";

export const APIRoute = createAPIFileRoute("/api/trpc/$trpc")({
  GET: ({ request }) => handle(request),
  POST: ({ request }) => handle(request),
});

function handle(request: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: () => createContext(),
  });
}
