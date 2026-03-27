import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/router";

export const Route = createFileRoute("/sandboxes/$name")({
  component: SandboxDetailPage,
});

function SandboxDetailPage() {
  const { name } = Route.useParams();
  const { data: sandbox, isPending, error } = useQuery(trpc.sandbox.get.queryOptions({ name }));

  if (isPending) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!sandbox) return <div>Not found</div>;

  return (
    <div>
      <h1>{sandbox.name}</h1>
      <dl>
        <dt>Status</dt>
        <dd>{sandbox.status}</dd>
        <dt>Shutdown</dt>
        <dd>{sandbox.shutdown}</dd>
      </dl>
    </div>
  );
}
