import { Link, useRouterState } from "@tanstack/react-router";
import { BotIcon, ChevronsUpDown, KeyRoundIcon, LogOutIcon, BookOpen } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
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
  useSidebar,
} from "@hermeum/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hermeum/components/ui/dropdown-menu";

interface Session {
  user?: { email?: string | null; name?: string | null };
}


type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

const GithubIcon: NavIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const agentNavItems = [
  { to: "/agents" as const, label: "Agents", icon: BotIcon },
  { to: "/shared-env-sets" as const, label: "Shared Env Sets", icon: KeyRoundIcon },
];

const resourceNavItems = [
  { to: "https://docs.hermeum.app" as const, label: "Docs", icon: BookOpen },
  { to: "https://github.com/hermeum/hermeum" as const, label: "GitHub", icon: GithubIcon },
];

export function AppSidebar({ session }: { session: Session | null | undefined }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();
  const email = session?.user?.email ?? "";
  const name = session?.user?.name ?? email;
  const initial = email.charAt(0).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1">
          <img src="/logo.png" alt="Hermeum logo" className="h-6 w-auto" />
          <span className="font-semibold text-sm">Hermeum</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Agents</SidebarGroupLabel>
          <SidebarMenu>
            {agentNavItems.map(({ to, label, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  render={<Link to={to} />}
                  isActive={pathname.startsWith(to)}
                  onClick={() => setOpenMobile(false)}
                >
                  <Icon />
                  {label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Resources</SidebarGroupLabel>
          <SidebarMenu>
            {resourceNavItems.map(({ to, label, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  render={<a href={to} target="_blank" rel="noopener noreferrer" />}
                  isActive={pathname.startsWith(to)}
                  onClick={() => setOpenMobile(false)}
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
              onClick={() => authClient.signOut().then(() => window.location.assign("/signin"))}
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
