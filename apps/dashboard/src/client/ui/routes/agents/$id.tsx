import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { stringify as stringifyYaml } from "yaml";
import { toast } from "sonner";

import { Badge } from "@hermeum/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hermeum/components/ui/tabs";
import { authClient } from "@/client/auth-client";
import { useTRPC } from "@/router";
import { PhaseBadge } from "@/client/ui/components/phase-badge";
import { Button } from "@hermeum/components/ui/button";
import { EditInstanceDialog } from "@/client/ui/components/edit-agent-dialog";
import { CodeEditor } from "@/client/ui/components/code-editor";
import { CopyButton } from "@/client/ui/components/copy-button";
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

export const Route = createFileRoute("/agents/$id")({
  component: AgentDetailPage,
});

const BADGE_MAX = 10;

function BadgeList({ items, max = BADGE_MAX }: { items: string[]; max?: number }) {
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((item) => (
        <Badge key={item} variant="secondary" className="font-mono text-xs">
          {item}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          +{overflow} more
        </Badge>
      )}
    </div>
  );
}

function AgentDetailPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: agent, isPending, error } = useQuery(trpc.agent.get.queryOptions({ id }));
  const { data: session } = authClient.useSession();
  const isOwner = !!session?.user && session.user.id === agent?.userId;
  const { data: gatewayToken } = useQuery({
    ...trpc.agent.getGatewayToken.queryOptions({ id }),
    enabled: isOwner,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tokenVisible, setTokenVisible] = useState(false);

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: trpc.agent.get.queryKey({ id }) });

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
  const { mutate: deleteAgent, isPending: isDeleting } = useMutation(
    trpc.agent.delete.mutationOptions({
      onSuccess: () => {
        toast.success("Agent deleted");
        navigate({ to: "/agents" });
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{agent.name ?? agent.id}</h1>
            <PhaseBadge phase={agent.phase} />
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
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Open actions menu" />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {agent.suspended ? (
                <DropdownMenuItem onClick={() => resumeAgent({ id })}>Resume</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => suspendAgent({ id })}>Pause</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agent">
        <TabsList>
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="connect">Connect</TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="mt-4">
          <div className="flex flex-col divide-y">
            {/* soul */}
            {agent.soul && (
              <div className="py-6 flex flex-col gap-3">
                <p className="text-sm font-medium">Soul</p>
                <pre className="rounded bg-muted p-3 text-xs overflow-auto max-h-64">
                  {agent.soul}
                </pre>
              </div>
            )}

            {/* config */}
            {agent.config && (
              <div className="py-6 flex flex-col gap-3">
                <p className="text-sm font-medium">Configuration</p>
                <CodeEditor value={stringifyYaml(agent.config)} readOnly maxHeight="300px" />
              </div>
            )}

            {/* skills */}
            {agent.skills && agent.skills.length > 0 && (
              <div className="py-6 flex flex-col gap-3">
                <p className="text-sm font-medium">Skills</p>
                <BadgeList items={agent.skills} max={10} />
              </div>
            )}

            {/* plugins */}
            {agent.plugins && agent.plugins.length > 0 && (
              <div className="py-6 flex flex-col gap-3">
                <p className="text-sm font-medium">Plugins</p>
                <BadgeList items={agent.plugins} max={10} />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="connect" className="mt-4">
          <div className="flex flex-col divide-y">
            {gatewayToken && (
              <div className="py-6 flex flex-col gap-3">
                <p className="text-sm font-medium">Gateway Token</p>
                <div className="group flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">
                    {tokenVisible ? gatewayToken : "•".repeat(32)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 group-hover:opacity-100"
                    onClick={() => setTokenVisible((v) => !v)}
                    aria-label={tokenVisible ? "Hide token" : "Show token"}
                  >
                    {tokenVisible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  </Button>
                  <CopyButton text={gatewayToken} className="opacity-0 group-hover:opacity-100" />
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteOpen(false);
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
            <Button variant="destructive" disabled={isDeleting} onClick={() => deleteAgent({ id })}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditInstanceDialog instance={agent} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
