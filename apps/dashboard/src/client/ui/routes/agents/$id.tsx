import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, EyeOff, MoreHorizontal, RefreshCw } from "lucide-react";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@hermeum/components/ui/accordion";
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

function ButtonList({ items, max = BADGE_MAX }: { items: string[]; max?: number }) {
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((item) => (
        <Button
          key={item}
          variant="outline"
          size="sm"
          className="h-auto px-2 py-1 font-mono text-xs"
        >
          {item}
        </Button>
      ))}
      {overflow > 0 && <span className="text-xs text-muted-foreground">+{overflow} more</span>}
    </div>
  );
}

function AgentDetailPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {
    data: agent,
    isPending,
    isFetching,
    error,
  } = useQuery(trpc.agent.get.queryOptions({ id }));
  const { data: session } = authClient.useSession();
  const isOwner = !!session?.user && session.user.id === agent?.userId;
  const { data: gatewayToken } = useQuery({
    ...trpc.agent.getGatewayToken.queryOptions({ id }),
    enabled: isOwner,
  });
  const envSetIds = agent?.sharedEnvSets ?? [];
  const envSetQueries = useQueries({
    queries: envSetIds.map((setId) => ({
      ...trpc.sharedEnvSet.get.queryOptions({ id: setId }),
      enabled: envSetIds.length > 0,
    })),
  });
  const envSets = envSetQueries
    .map((q) => q.data)
    .filter((s): s is NonNullable<typeof s> => s != null);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
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
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{agent.name ?? agent.id}</h1>
            {agent.archived ? (
              <Badge variant="secondary">Archived</Badge>
            ) : (
              <PhaseBadge phase={agent.phase} />
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
      <Tabs defaultValue="agent">
        <TabsList>
          <TabsTrigger value="agent">Agent</TabsTrigger>
          <TabsTrigger value="connect">Connect</TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="mt-4">
          <div className="flex flex-col divide-y">
            {/* soul */}
            {agent.soul && (
              <div className="py-8 flex flex-col gap-3">
                <p className="text-sm font-medium">Soul</p>
                <pre className="rounded bg-muted p-3 text-xs overflow-auto max-h-64">
                  {agent.soul}
                </pre>
              </div>
            )}

            {/* config */}
            {agent.config && (
              <div className="py-8 flex flex-col gap-3">
                <p className="text-sm font-medium">Configuration</p>
                <CodeEditor
                  value={stringifyYaml(agent.config, { blockQuote: "literal", lineWidth: 0 }).trim()}
                  readOnly
                  maxHeight="300px"
                />
              </div>
            )}

            {/* skills */}
            {agent.skills && agent.skills.length > 0 && (
              <div className="py-8 flex flex-col gap-3">
                <p className="text-sm font-medium">Skills</p>
                <ButtonList items={agent.skills} max={10} />
              </div>
            )}

            {/* plugins */}
            {agent.plugins && agent.plugins.length > 0 && (
              <div className="py-8 flex flex-col gap-3">
                <p className="text-sm font-medium">Plugins</p>
                <ButtonList items={agent.plugins} max={10} />
              </div>
            )}

            {/* packages */}
            {agent.packages?.pip && agent.packages.pip.length > 0 && (
              <div className="py-8 flex flex-col gap-3">
                <p className="text-sm font-medium">Python Packages</p>
                <ButtonList items={agent.packages.pip} max={10} />
              </div>
            )}

            {agent.packages?.npm && agent.packages.npm.length > 0 && (
              <div className="py-8 flex flex-col gap-3">
                <p className="text-sm font-medium">npm Packages</p>
                <ButtonList items={agent.packages.npm} max={10} />
              </div>
            )}

            {/* env */}
            {agent.env && agent.env.length > 0 && (
              <div className="py-8 flex flex-col gap-3">
                <p className="text-sm font-medium">Environment Variables</p>
                <div className="flex flex-wrap gap-2">
                  {agent.env.map((v) => (
                    <Button
                      key={v.name}
                      variant="outline"
                      size="sm"
                      className="h-auto px-2 py-1 font-mono text-xs"
                    >
                      {v.name}={v.value}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* shared env sets */}
            <div className="py-8 flex flex-col gap-3">
              <p className="text-sm font-medium">Shared Env Sets</p>
              {agent.sharedEnvSets && agent.sharedEnvSets.length > 0 ? (
                <Accordion multiple className="w-full border rounded-md px-4">
                  {envSets?.map((envSet) => (
                    <AccordionItem key={envSet.id} value={envSet.id}>
                      <AccordionTrigger className="items-center hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="font-medium hover:underline">{envSet.name}</span>
                          <div className="group flex items-center gap-1">
                            <span className="font-mono text-xs text-muted-foreground">
                              {envSet.id}
                            </span>
                            <CopyButton
                              text={envSet.id}
                              className="opacity-0 group-hover:opacity-100"
                            />
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {envSet.envVars.length > 0 ? (
                          <div className="flex flex-wrap gap-2 pb-2">
                            {envSet.envVars.map((v) => (
                              <Button
                                key={v.name}
                                variant="outline"
                                size="sm"
                                className="h-auto px-2 py-1 font-mono text-xs"
                              >
                                {v.name}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground pb-2">
                            No environment variables.
                          </p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <p className="text-sm text-muted-foreground">No shared env sets attached.</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="connect" className="mt-4">
          <div className="flex flex-col divide-y">
            {gatewayToken && (
              <div className="py-8 flex flex-col gap-3">
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
