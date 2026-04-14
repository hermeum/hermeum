import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTRPC } from "@/router";

export const Route = createFileRoute("/instances/$id")({
  component: InstanceDetailPage,
});

function InstanceDetailPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const { data: instance, isPending, error } = useQuery(trpc.instance.get.queryOptions({ id }));

  if (isPending) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!instance) return <div>Not found</div>;

  return (
    <div>
      <h1>{instance.agentName}</h1>
      <dl>
        <dt>Storage</dt>
      </dl>
    </div>
  );
}
