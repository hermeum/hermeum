import { createRootRouteWithContext, Link, Outlet, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Button } from "@kubeclaw/components/ui/button";
import { authClient } from "@/client/auth-client";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/login") {
      return;
    }

    const { data: session } = await authClient.getSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
  },
  component: RootLayout,
});

function RootLayout() {
  const { data: session } = authClient.useSession();

  return (
    <>
      <nav className="flex items-center gap-4 p-4 border-b">
        <Link to="/">Dashboard</Link>
        <Link to="/agents">Agents</Link>
        <Link to="/secrets">Secrets</Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{session?.user?.email}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => authClient.signOut().then(() => window.location.assign("/login"))}
          >
            Sign out
          </Button>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </>
  );
}
