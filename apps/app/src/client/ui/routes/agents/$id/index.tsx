import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@hermeum/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hermeum/components/ui/tabs";
import { Button } from "@hermeum/components/ui/button";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@hermeum/components/ui/dropdown-menu";

import { useTRPC } from "@/router";
import { PhaseBadge } from "@/client/ui/components/phase-badge";
import { CopyButton } from "@/client/ui/components/copy-button";
import { EditInstanceDialog } from "./-components/edit-agent-dialog";
import { AgentTab } from "./-components/agent-tab";
import { SessionsTab } from "./-components/sessions-tab";

export const Route = createFileRoute("/agents/$id/")({
  component: AgentDetailPage,
  validateSearch: (search: Record<string, unknown>): { tab?: "agent" | "sessions"; page?: number } => {
    const tab = search.tab;
    const rawPage = search.page;
    const page =
      typeof rawPage === "number" ? rawPage : typeof rawPage === "string" ? Number(rawPage) : NaN;
    return {
      ...(tab === "agent" || tab === "sessions" ? { tab } : {}),
      ...(Number.isInteger(page) && page >= 1 ? { page } : {}),
    };
  },
});

function AgentDetailPage() {
  const { id } = Route.useParams();
  const { tab = "agent", page = 1 } = Route.useSearch();
  const navigate = useNavigate();
  const setTab = (tab: "agent" | "sessions") =>
    void navigate({ to: "/agents/$id", params: { id }, search: (prev) => ({ ...prev, tab }) });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {
    data: agent,
    isPending,
    isFetching,
    error,
  } = useQuery(trpc.agent.get.queryOptions({ id }));
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const invalidateDetail = () => {
    queryClient.invalidateQueries({ queryKey: trpc.agent.get.queryKey({ id }) });
    // No input → the key is the procedure-path prefix, so every page of the
    // session list (any limit/offset) is refetched, not just the visible one.
    queryClient.invalidateQueries({ queryKey: trpc.agentSession.list.queryKey() });
  };

  const { mutate: suspendAgent } = useMutation(
    trpc.agent.suspend.mutationOptions({
      onSuccess: () => {
        toast.success("Agent paused");
        setTimeout(invalidateDetail, 500);
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const { mutate: resumeAgent } = useMutation(
    trpc.agent.resume.mutationOptions({
      onSuccess: () => {
        toast.success("Agent resumed");
        setTimeout(invalidateDetail, 500);
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const { mutate: archiveAgent, isPending: isArchiving } = useMutation(
    trpc.agent.archive.mutationOptions({
      onSuccess: () => {
        toast.success("Agent archived");
        setArchiveOpen(false);
        setTimeout(invalidateDetail, 500);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (isPending) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error.message}</div>;
  if (!agent) return <div className="p-6">Not found</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{agent.name ?? agent.id}</h1>
            {agent.archived ? (
              <Badge variant="secondary">Archived</Badge>
            ) : (
              <PhaseBadge phase={agent.phase} reason={agent.reason} />
            )}
          </div>
          <div className="group flex items-center gap-1">
            <p className="text-sm text-muted-foreground font-mono">{agent.id}</p>
            <CopyButton text={agent.id} className="opacity-0 group-hover:opacity-100" />
          </div>
          {agent.description && (
            <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
          )}
          {agent.type && (
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium">Type:</span> {agent.type}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!agent.archived && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          )}
          {!agent.archived && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" size="icon" aria-label="Open actions menu" />}
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate({ to: "/agents/$id/edit", params: { id } })}>
                  Guided edit
                </DropdownMenuItem>
                {agent.suspended ? (
                  <DropdownMenuItem onClick={() => resumeAgent({ id })}>Resume</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => suspendAgent({ id })}>Pause</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setArchiveOpen(true)}>
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh agent"
            onClick={invalidateDetail}
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "agent" | "sessions")}>
        <TabsList variant="line">
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="agent">
          <AgentTab agent={agent} />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsTab agentId={id} page={page} />
        </TabsContent>
      </Tabs>

      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open) setArchiveOpen(false);
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
              onClick={() => archiveAgent({ id })}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditInstanceDialog instance={agent} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}