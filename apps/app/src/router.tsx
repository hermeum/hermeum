import { createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import SuperJSON from "superjson";
import type { AppRouter } from "@/server/routers/trpc/index";
import { routeTree } from "./routeTree.gen";

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: "/trpc", transformer: SuperJSON })],
});

export const queryClient = new QueryClient();

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    context: { queryClient },
    Wrap: ({ children }) => (
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </TRPCProvider>
    ),
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
