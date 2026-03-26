import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { queryClient } from "@/trpc";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "KubeBox" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <nav>
            <Link to="/">Dashboard</Link>
            {" | "}
            <Link to="/sandboxes">Sandboxes</Link>
          </nav>
          <main>
            <Outlet />
          </main>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
