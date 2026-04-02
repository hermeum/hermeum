import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { queryClient, trpc } from "@/router";

export const Route = createFileRoute("/sandboxes/")({
  component: SandboxListPage,
});

function SandboxItem({
  name,
  status,
  onDelete,
}: {
  name: string;
  status: string;
  onDelete: () => void;
}) {
  const {
    mutate: runCommand,
    isPending: isRunning,
    data: result,
  } = useMutation(trpc.command.run.mutationOptions());

  return (
    <li>
      <strong>{name}</strong> — {status}
      <button onClick={onDelete}>Delete</button>
      <button
        disabled={isRunning}
        onClick={() =>
          runCommand({ sandboxName: name, command: ["sh", "-c", "sleep 1 && echo Hello, world!"] })
        }
      >
        {isRunning ? "Running…" : "Run sleep"}
      </button>
      {result && <span> exitCode: {result.exitCode}</span>}
    </li>
  );
}

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
            sandboxTemplate: "kubeclaw-default-template",
          })
        }
      >
        {isCreating ? "Creating…" : "Create sandbox"}
      </button>
      {sandboxes?.length === 0 && <p>No sandboxes running.</p>}
      <ul>
        {sandboxes?.map((s) => (
          <SandboxItem
            key={s.name}
            name={s.name}
            status={s.status}
            onDelete={() => deleteSandbox({ name: s.name })}
          />
        ))}
      </ul>
    </div>
  );
}
