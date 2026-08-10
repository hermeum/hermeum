import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/router";
import { CopyButton } from "@/client/ui/components/copy-button";
import { CreateSharedEnvSetDialog } from "./_components/create-shared-env-set-dialog";
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
} from "@hermeum/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hermeum/components/ui/table";

const ENV_VAR_LIMIT = 3;

function EnvVarList({ envVars }: { envVars: { name: string }[] }) {
  if (envVars.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const visible = envVars.slice(0, ENV_VAR_LIMIT);
  const overflow = envVars.length - ENV_VAR_LIMIT;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((v) => (
        <span key={v.name} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {v.name}
        </span>
      ))}
      {overflow > 0 && (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

export const Route = createFileRoute("/shared-env-sets/")({
  component: SharedEnvSetsPage,
});

function SharedEnvSetsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "active">("active");
  const navigate = useNavigate();

  const {
    data: envSets,
    isPending,
    error,
  } = useQuery(
    trpc.sharedEnvSet.list.queryOptions(tab === "active" ? { archived: false } : undefined)
  );
  const visibleEnvSets = envSets;

  const { mutate: archiveEnvSet, isPending: isArchiving } = useMutation(
    trpc.sharedEnvSet.archive.mutationOptions({
      onSuccess: () => {
        toast.success("Shared env set archived");
        queryClient.invalidateQueries({ queryKey: trpc.sharedEnvSet.list.queryKey() });
        setArchiveId(null);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (isPending) {
    return <div className="p-6">Loading shared env sets…</div>;
  }

  if (error) {
    return <div className="p-6 text-destructive">Error: {error.message}</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Shared Env Sets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage sharable sets of environment variables used across agents.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New env set
        </Button>
      </div>

      <CreateSharedEnvSetDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <Dialog
        open={archiveId !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveId(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive shared env set</DialogTitle>
            <DialogDescription>
              You will no longer be able to use it in your agents, but existing agents using it will
              not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={isArchiving}
              onClick={() => {
                if (archiveId) archiveEnvSet({ id: archiveId });
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
                <TableHead>Env Vars</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEnvSets?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No shared env sets yet.
                  </TableCell>
                </TableRow>
              ) : (
                visibleEnvSets?.map((envSet) => (
                  <TableRow
                    key={envSet.id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({ to: "/shared-env-sets/$id", params: { id: envSet.id } })
                    }
                  >
                    <TableCell className="max-w-32 font-mono text-xs">
                      <div className="group flex items-center gap-1 min-w-0">
                        <span className="truncate">{envSet.id}</span>
                        <CopyButton
                          text={envSet.id}
                          className="opacity-0 group-hover:opacity-100"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{envSet.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge>{envSet.archived ? "Archived" : "Active"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <EnvVarList envVars={envSet.envVars} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {envSet.createdAt
                        ? formatDistanceToNow(envSet.createdAt, { addSuffix: true })
                        : "—"}
                    </TableCell>
                    <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                      {!envSet.archived && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" aria-label="Open actions menu" />
                            }
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setArchiveId(envSet.id)}
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
