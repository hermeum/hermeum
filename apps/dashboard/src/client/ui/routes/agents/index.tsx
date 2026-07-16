import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/router";
import { CopyButton } from "@/client/ui/components/copy-button";
import { PhaseBadge } from "@/client/ui/components/phase-badge";
import { Badge } from "@hermeum/components/ui/badge";
import { Button } from "@hermeum/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hermeum/components/ui/tabs";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hermeum/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@hermeum/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hermeum/components/ui/table";

export const Route = createFileRoute("/agents/")({
  component: DashboardPage,
});

function DashboardPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "active">("active");
  const navigate = useNavigate();

  const {
    data: agents,
    isPending,
    isFetching,
    error,
  } = useQuery(trpc.agent.list.queryOptions(tab === "active" ? { archived: false } : undefined));

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: trpc.agent.list.queryKey() });

  const { mutate: suspendAgent } = useMutation(
    trpc.agent.suspend.mutationOptions({
      onSuccess: () => {
        toast.success("Agent paused");
        setTimeout(invalidateList, 500);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const { mutate: resumeAgent } = useMutation(
    trpc.agent.resume.mutationOptions({
      onSuccess: () => {
        toast.success("Agent resumed");
        setTimeout(invalidateList, 500);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const { mutate: archiveAgent, isPending: isArchiving } = useMutation(
    trpc.agent.archive.mutationOptions({
      onSuccess: () => {
        toast.success("Agent archived");
        invalidateList();
        setArchiveId(null);
      },
      onError: (e) => toast.error(e.message),
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
          <Button onClick={() => navigate({ to: "/agents/new" })}>
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

      <Dialog
        open={archiveId !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveId(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive agent</DialogTitle>
            <DialogDescription>
              The agent will be permanently suspended and cannot be resumed. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={isArchiving}
              onClick={() => {
                if (archiveId) archiveAgent({ id: archiveId });
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "active")}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}>
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
              {agents?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No agents yet.
                  </TableCell>
                </TableRow>
              ) : (
                agents?.map((agent) => (
                  <TableRow
                    key={agent.id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/agents/$id", params: { id: agent.id } })}
                  >
                    <TableCell className="max-w-32 font-mono text-xs">
                      <div className="group flex items-center gap-1 min-w-0">
                        <span className="truncate">{agent.id}</span>
                        <CopyButton text={agent.id} className="opacity-0 group-hover:opacity-100" />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{agent.name ?? "-"}</TableCell>
                    <TableCell>
                      {agent.archived ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : (
                        <PhaseBadge phase={agent.phase} />
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {agent.createdAt
                        ? formatDistanceToNow(agent.createdAt, { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      {!agent.archived && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" aria-label="Open actions menu" />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {agent.suspended ? (
                              <DropdownMenuItem onClick={() => resumeAgent({ id: agent.id })}>
                                Resume
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => suspendAgent({ id: agent.id })}>
                                Pause
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setArchiveId(agent.id)}
                            >
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
