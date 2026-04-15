import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/router";
import { CreateAgentDialog } from "@/client/ui/components/create-agent-dialog";
import type { InstancePhase } from "@/entities";
import { Badge } from "@kubeclaw/components/ui/badge";
import { Button } from "@kubeclaw/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kubeclaw/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kubeclaw/components/ui/table";

export const Route = createFileRoute("/instances/")({
  component: DashboardPage,
});

function getStatusVariant(
  phase: InstancePhase | undefined
): "default" | "secondary" | "destructive" | "outline" {
  switch (phase) {
    case "Running":
    case "Pending":
    case "Provisioning":
    case "Updating":
    case "BackingUp":
    case "Restoring":
      return "secondary";
    case "Degraded":
    case "Failed":
      return "destructive";
    case "Terminating":
    case "Suspended":
      return "outline";
    default:
      return "outline";
  }
}

function DashboardPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: instances, isPending, error } = useQuery(trpc.instance.list.queryOptions());

  const { mutate: deleteInstance } = useMutation(
    trpc.instance.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.instance.list.queryKey() }),
    })
  );

  if (isPending) {
    return <div className="p-6">Loading agents…</div>;
  }

  if (error) {
    return <div className="p-6 text-destructive">Error: {error.message}</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage autonomous agents.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New agent
        </Button>
      </div>

      <CreateAgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: trpc.instance.list.queryKey() })}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {instances?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No agents yet.
              </TableCell>
            </TableRow>
          ) : (
            instances?.map((instance) => (
              <TableRow key={instance.id}>
                <TableCell className="max-w-32 truncate font-mono text-xs">{instance.id}</TableCell>
                <TableCell className="font-medium">{instance.agentName ?? "-"}</TableCell>
                <TableCell>
                  <Badge variant={getStatusVariant(instance.phase)}>{instance.phase ?? "-"}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {instance.createdAt
                    ? formatDistanceToNow(instance.createdAt, { addSuffix: true })
                    : "—"}
                </TableCell>
                <TableCell className="w-10">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" aria-label="Open actions menu" />}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        render={<Link to="/instances/$id" params={{ id: instance.id }} />}
                      >
                        View
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => deleteInstance({ id: instance.id })}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
