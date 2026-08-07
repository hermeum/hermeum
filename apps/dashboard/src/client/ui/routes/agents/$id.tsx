import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/agents/$id")({
  component: AgentLayout,
});

function AgentLayout() {
  return <Outlet />;
}