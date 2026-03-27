import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <nav>
        <Link to="/">Dashboard</Link>
        {" | "}
        <Link to="/sandboxes">Sandboxes</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
