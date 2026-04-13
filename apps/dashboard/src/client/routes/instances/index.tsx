import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { queryClient } from "@/router";
import { instanceUseCase, templateUseCase } from "@/client/container";
import { Button } from "@kubeclaw/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kubeclaw/components/ui/table";

export const Route = createFileRoute("/instances/")({
  component: InstanceListPage,
});

function formatDate(date: Date | undefined): string {
  if (!date) return "—";
  return format(date, "MMM d, yyyy");
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
      <div className="flex items-center gap-2">
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
      </div>
      {instances?.length === 0 ? (
        <p>No instances running.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {instances?.map((instance) => (
              <TableRow key={instance.name}>
                <TableCell className="max-w-24 truncate font-mono text-xs text-muted-foreground">
                  {instance.id}
                </TableCell>
                <TableCell className="font-medium">{instance.name}</TableCell>
                <TableCell>{instance.status ?? "—"}</TableCell>
                <TableCell>{formatDate(instance.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteInstance(instance.name)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
