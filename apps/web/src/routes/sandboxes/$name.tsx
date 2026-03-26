import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/sandboxes/$name")({
  component: SandboxDetailPage,
});

function SandboxDetailPage() {
  const { name } = Route.useParams();
  const { data: sandbox, isPending, error } = trpc.sandbox.get.useQuery({ name });

  if (isPending) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!sandbox) return <div>Not found</div>;

  return (
    <div>
      <h1>{sandbox.metadata.name}</h1>
      <dl>
        <dt>Namespace</dt>
        <dd>{sandbox.metadata.namespace}</dd>
        <dt>Phase</dt>
        <dd>{sandbox.status?.phase ?? "—"}</dd>
        <dt>Image</dt>
        <dd>{sandbox.spec.container.image}</dd>
        <dt>Singleton Key</dt>
        <dd>{sandbox.spec.singletonKey}</dd>
      </dl>
    </div>
  );
}
