import { Link, useRouterState } from "@tanstack/react-router";
import { BotIcon, ChevronsUpDown, KeyRoundIcon, LogOutIcon } from "lucide-react";
import { authClient } from "@/client/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@kubeclaw/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kubeclaw/components/ui/dropdown-menu";

interface Session {
  user?: { email?: string | null; name?: string | null };
}

const navItems = [
  { to: "/agents" as const, label: "Agents", icon: BotIcon },
  { to: "/secrets" as const, label: "Secrets", icon: KeyRoundIcon },
];

export function AppSidebar({ session }: { session: Session | null | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const email = session?.user?.email ?? "";
  const name = session?.user?.name ?? email;
  const initial = email.charAt(0).toUpperCase();

  return (
    <Sidebar collapsible="none">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="size-8 rounded-md bg-foreground flex items-center justify-center">
            <BotIcon className="size-4 text-background" />
          </div>
          <span className="font-semibold text-sm">KubeClaw</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map(({ to, label, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  render={<Link to={to} />}
                  isActive={pathname.startsWith(to)}
                >
                  <Icon />
                  {label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-2 rounded-md p-2 h-12 text-sm text-left outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring">
            <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="text-sm font-medium">{initial}</span>
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium truncate">{name}</span>
              <span className="text-xs text-muted-foreground truncate">{email}</span>
            </div>
            <ChevronsUpDown className="size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuItem
              onClick={() =>
                authClient.signOut().then(() => window.location.assign("/signin"))
              }
            >
              <LogOutIcon className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
