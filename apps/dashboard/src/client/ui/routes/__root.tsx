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
} from "@hermeum/components/ui/sidebar";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
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
      <SidebarInset className="min-h-0 overflow-hidden">
        <Outlet />
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}
