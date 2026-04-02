import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div>
      <h1>KubeClaw Dashboard</h1>
      <p>Manage your agent sandbox workloads.</p>
    </div>
  );
}
