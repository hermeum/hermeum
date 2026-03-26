import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>KubeBox</title>
      </head>
      <body>
        <nav>
          <Link to="/">Dashboard</Link>
          <Link to="/sandboxes">Sandboxes</Link>
        </nav>
        <main>
          <Outlet />
        </main>
      </body>
    </html>
  );
}
