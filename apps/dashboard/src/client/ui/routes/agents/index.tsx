import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/router";
import { CreateAgentDialog } from "@/client/ui/components/create-agent-dialog";
import { CopyButton } from "@/client/ui/components/copy-button";
import { PhaseBadge } from "@/client/ui/components/phase-badge";
import { Button } from "@kubeclaw/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kubeclaw/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@kubeclaw/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kubeclaw/components/ui/table";

export const Route = createFileRoute("/agents/")({
  component: DashboardPage,
});

function DashboardPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();

  const {
    data: instances,
    isPending,
    isFetching,
    error,
  } = useQuery(trpc.instance.list.queryOptions());

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.instance.list.queryKey() });

  const { mutate: suspendInstance } = useMutation(
    trpc.instance.suspend.mutationOptions({ onSuccess: () => setTimeout(invalidateList, 500) })
  );

  const { mutate: resumeInstance } = useMutation(
    trpc.instance.resume.mutationOptions({ onSuccess: () => setTimeout(invalidateList, 500) })
  );

  const { mutate: deleteInstance, isPending: isDeleting } = useMutation(
    trpc.instance.delete.mutationOptions({
      onSuccess: () => {
        invalidateList();
        setDeleteId(null);
      },
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
        <div className="flex gap-2">
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4" />
            New agent
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh agents"
            onClick={invalidateList}
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <CreateAgentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: trpc.instance.list.queryKey() })}
      />

      <Dialog
        open={deleteId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this agent? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                if (deleteId) deleteInstance({ id: deleteId });
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <TableRow
                key={instance.id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/agents/$id", params: { id: instance.id } })}
              >
                <TableCell className="max-w-32 font-mono text-xs">
                  <div className="group flex items-center gap-1 min-w-0">
                    <span className="truncate">{instance.id}</span>
                    <CopyButton text={instance.id} className="opacity-0 group-hover:opacity-100" />
                  </div>
                </TableCell>
                <TableCell className="font-medium">{instance.agentName ?? "-"}</TableCell>
                <TableCell>
                  <PhaseBadge phase={instance.phase} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {instance.createdAt
                    ? formatDistanceToNow(instance.createdAt, { addSuffix: true })
                    : "—"}
                </TableCell>
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon" aria-label="Open actions menu" />}
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {instance.suspended ? (
                        <DropdownMenuItem onClick={() => resumeInstance({ id: instance.id })}>
                          Resume
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => suspendInstance({ id: instance.id })}>
                          Pause
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleteId(instance.id)}
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
