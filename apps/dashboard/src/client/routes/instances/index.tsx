import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryClient } from "@/router";
import { instanceUseCase, templateUseCase } from "@/client/container";
import { Button } from "@kubeclaw/components/ui/button";

export const Route = createFileRoute("/instances/")({
  component: InstanceListPage,
});

function InstanceItem({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <li>
      <strong>{name}</strong>
      <Button variant="destructive" onClick={onDelete}>
        Delete
      </Button>
    </li>
  );
}

function InstanceListPage() {
  const {
    data: instances,
    isPending,
    error,
  } = useQuery({
    queryKey: ["instances"],
    queryFn: () => instanceUseCase.list(),
  });
  const { data: templates, isPending: isTemplatesLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => templateUseCase.list(),
  });
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const { mutate: createInstance, isPending: isCreating } = useMutation({
    mutationFn: (templateName: string) => instanceUseCase.create(templateName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["instances"] }),
  });
  const { mutate: deleteInstance } = useMutation({
    mutationFn: (name: string) => instanceUseCase.delete(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["instances"] }),
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
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button
        disabled={isCreating || !selectedTemplate}
        onClick={() => createInstance(selectedTemplate)}
      >
        {isCreating ? "Creating…" : "Create instance"}
      </Button>
      {instances?.length === 0 && <p>No instances running.</p>}
      <ul>
        {instances?.map((i) => (
          <InstanceItem key={i.name} name={i.name} onDelete={() => deleteInstance(i.name)} />
        ))}
      </ul>
    </div>
  );
}
