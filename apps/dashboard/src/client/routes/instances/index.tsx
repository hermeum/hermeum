import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { queryClient, trpc } from "@/router";

export const Route = createFileRoute("/instances/")({
  component: InstanceListPage,
});

function InstanceItem({
  name,
  status,
  onDelete,
}: {
  name: string;
  status: string;
  onDelete: () => void;
}) {
  return (
    <li>
      <strong>{name}</strong> — {status}
      <button onClick={onDelete}>Delete</button>
    </li>
  );
}

function InstanceListPage() {
  const { data: instances, isPending, error } = useQuery(trpc.instance.list.queryOptions());
  const { mutate: createInstance, isPending: isCreating } = useMutation({
    ...trpc.instance.create.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(trpc.instance.list.queryOptions()),
  });
  const { mutate: deleteInstance } = useMutation({
    ...trpc.instance.delete.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(trpc.instance.list.queryOptions()),
  });

  if (isPending) return <div>Loading instances…</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>Instances</h1>
      <button
        disabled={isCreating}
        onClick={() =>
          createInstance({ templateName: "kubeclaw-default-template" })
        }
      >
        {isCreating ? "Creating…" : "Create instance"}
      </button>
      {instances?.length === 0 && <p>No instances running.</p>}
      <ul>
        {instances?.map((i) => (
          <InstanceItem
            key={i.name}
            name={i.name}
            status={i.storage.size}
            onDelete={() => deleteInstance({ name: i.name })}
          />
        ))}
      </ul>
    </div>
  );
}
