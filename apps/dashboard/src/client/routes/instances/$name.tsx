import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { instanceUseCase } from "@/client/container";

export const Route = createFileRoute("/instances/$name")({
  component: InstanceDetailPage,
});

function InstanceDetailPage() {
  const { name } = Route.useParams();
  const {
    data: instance,
    isPending,
    error,
  } = useQuery({
    queryKey: ["instances", name],
    queryFn: () => instanceUseCase.get(name),
  });

  if (isPending) return <div>Loading…</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!instance) return <div>Not found</div>;

  return (
    <div>
      <h1>{instance.name}</h1>
      <dl>
        <dt>Storage</dt>
      </dl>
    </div>
  );
}
