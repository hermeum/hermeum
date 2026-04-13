import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryClient, trpc } from "@/router";
import { Button } from "@kubeclaw/components/ui/button";

export const Route = createFileRoute("/instances/")({
  component: InstanceListPage,
});

function InstanceItem({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <li>
      <strong>{name}</strong>
      <Button variant="destructive" onClick={onDelete}>Delete</Button>
    </li>
  );
}

function InstanceListPage() {
  const { data: instances, isPending, error } = useQuery(trpc.instance.list.queryOptions());
  const { data: templates, isPending: isTemplatesLoading } = useQuery(
    trpc.template.list.queryOptions()
  );
  const [selectedTemplate, setSelectedTemplate] = useState("");

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
      <select
        value={selectedTemplate}
        onChange={(e) => setSelectedTemplate(e.target.value)}
        disabled={isTemplatesLoading}
      >
        <option value="">Select a template…</option>
        {templates?.map((t) => (
          <option key={t.name} value={t.name}>
            {t.name}
          </option>
        ))}
      </select>
      <Button
        disabled={isCreating || !selectedTemplate}
        onClick={() => createInstance({ templateName: selectedTemplate })}
      >
        {isCreating ? "Creating…" : "Create instance"}
      </Button>
      {instances?.length === 0 && <p>No instances running.</p>}
      <ul>
        {instances?.map((i) => (
          <InstanceItem
            key={i.name}
            name={i.name}
            onDelete={() => deleteInstance({ name: i.name })}
          />
        ))}
      </ul>
    </div>
  );
}
