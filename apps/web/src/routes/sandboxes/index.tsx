import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/trpc";

export const Route = createFileRoute("/sandboxes/")({
  component: SandboxListPage,
});

function SandboxListPage() {
  const { data: sandboxes, isPending, error } = trpc.sandbox.list.useQuery();

  if (isPending) return <div>Loading sandboxes…</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>Sandboxes</h1>
      {sandboxes?.length === 0 && <p>No sandboxes running.</p>}
      <ul>
        {sandboxes?.map((s) => (
          <li key={`${s.metadata.namespace}/${s.metadata.name}`}>
            <strong>{s.metadata.name}</strong> — {s.status?.phase ?? "Unknown"}
          </li>
        ))}
      </ul>
    </div>
  );
}
