import {
  createRootRouteWithContext,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { authClient } from "@/client/auth-client";
import { AppSidebar } from "@/client/ui/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@hermeum/components/ui/sidebar";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    // Demo mode disables sign-in: the server maps every visitor to a shared
    // demo user, so there is no session to check or sign-in page to show.
    if (window.__HERMEUM_DEMO__ === true) {
      if (location.pathname === "/signin") {
        throw redirect({ to: "/agents" });
      }
      return;
    }

    if (location.pathname === "/signin") {
      return;
    }

    const { data: session } = await authClient.getSession();
    if (!session) {
      throw redirect({ to: "/signin" });
    }
  },
  component: RootLayout,
});

function RootLayout() {
  const { data: session } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === "/signin") {
    return <Outlet />;
  }

  return (
    <SidebarProvider className="h-svh">
      <AppSidebar session={session} />
      <SidebarInset className="min-h-0 overflow-y-auto">
        <header className="flex h-14 items-center px-4 md:hidden">
          <SidebarTrigger />
        </header>
        <Outlet />
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
