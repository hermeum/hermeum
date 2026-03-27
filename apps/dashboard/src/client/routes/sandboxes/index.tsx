import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { queryClient, trpc } from "@/router";

export const Route = createFileRoute("/sandboxes/")({
  component: SandboxListPage,
});

function SandboxListPage() {
  const { data: sandboxes, isPending, error } = useQuery(trpc.sandbox.list.queryOptions());
  const { mutate: createSandbox, isPending: isCreating } = useMutation({
    ...trpc.sandbox.create.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(trpc.sandbox.list.queryOptions()),
  });
  const { mutate: deleteSandbox } = useMutation({
    ...trpc.sandbox.delete.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(trpc.sandbox.list.queryOptions()),
  });

  if (isPending) return <div>Loading sandboxes…</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>Sandboxes</h1>
      <button
        disabled={isCreating}
        onClick={() =>
          createSandbox({
            name: `sandbox-${Math.random().toString(36).slice(2, 8)}`,
            sandboxTemplate: "secure-datascience-template",
          })
        }
      >
        {isCreating ? "Creating…" : "Create sandbox"}
      </button>
      {sandboxes?.length === 0 && <p>No sandboxes running.</p>}
      <ul>
        {sandboxes?.map((s) => (
          <li key={s.name}>
            <strong>{s.name}</strong> — {s.status}
            <button onClick={() => deleteSandbox({ name: s.name })}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
