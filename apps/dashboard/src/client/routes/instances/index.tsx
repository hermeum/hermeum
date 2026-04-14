import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { useTRPC } from "@/router";
import { Button } from "@kubeclaw/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kubeclaw/components/ui/table";
import { Template } from "@/entities";

export const Route = createFileRoute("/instances/")({
  component: InstanceListPage,
});

function formatDate(date: Date | undefined): string {
  if (!date) return "—";
  return format(date, "MMM d, yyyy");
}

function InstanceListPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: instances, isPending, error } = useQuery(trpc.instance.list.queryOptions());
  const { data: templates, isPending: isTemplatesLoading } = useQuery(
    trpc.template.list.queryOptions()
  );
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const { mutate: createInstance, isPending: isCreating } = useMutation(
    trpc.instance.create.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.instance.list.queryKey() }),
    })
  );
  const { mutate: deleteInstance } = useMutation(
    trpc.instance.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.instance.list.queryKey() }),
    })
  );

  if (isPending) {
    return <div>Loading instances…</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

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
          onClick={() => {
            const {
              id: _id,
              name: _name,
              ...instanceInput
            } = templates?.find((t) => t.id === selectedTemplate) as Template;
            createInstance({ ...instanceInput });
          }}
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
              <TableRow key={instance.agentName}>
                <TableCell className="max-w-24 truncate font-mono text-xs text-muted-foreground">
                  {instance.id}
                </TableCell>
                <TableCell className="font-medium">{instance.agentName}</TableCell>
                <TableCell>{instance.phase ?? "—"}</TableCell>
                <TableCell>{formatDate(instance.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteInstance({ id: instance.id })}
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
