import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { useTRPC } from "@/router";
import { CopyButton } from "@/client/ui/components/copy-button";
import { CreateSecretDialog } from "@/client/ui/components/create-secret-dialog";
import { Badge } from "@kubeclaw/components/ui/badge";
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
} from "@kubeclaw/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kubeclaw/components/ui/table";

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

export const Route = createFileRoute("/secrets/")({
  component: SecretsPage,
});

function SecretsPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: secrets, isPending, error } = useQuery(trpc.secret.list.queryOptions());

  const { mutate: archiveSecret, isPending: isArchiving } = useMutation(
    trpc.secret.archive.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.secret.list.queryKey() });
        setArchiveId(null);
      },
    })
  );

  if (isPending) {
    return <div className="p-6">Loading secrets…</div>;
  }

  if (error) {
    return <div className="p-6 text-destructive">Error: {error.message}</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Secrets</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage secrets that contain sensitive environment variables.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          New secret
        </Button>
      </div>

      <CreateSecretDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <Dialog
        open={archiveId !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveId(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive secret</DialogTitle>
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
                if (archiveId) archiveSecret({ id: archiveId });
              }}
            >
              Archive
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
            <TableHead>Env Vars</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {secrets?.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No secrets yet.
              </TableCell>
            </TableRow>
          ) : (
            secrets?.map((secret) => (
              <TableRow
                key={secret.id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/secrets/$id", params: { id: secret.id } })}
              >
                <TableCell className="max-w-32 font-mono text-xs">
                  <div className="group flex items-center gap-1 min-w-0">
                    <span className="truncate">{secret.id}</span>
                    <CopyButton text={secret.id} className="opacity-0 group-hover:opacity-100" />
                  </div>
                </TableCell>
                <TableCell className="font-medium">{secret.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{secret.archived ? "Archived" : "Active"}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <EnvVarList envVars={secret.envVars} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {secret.createdAt
                    ? formatDistanceToNow(secret.createdAt, { addSuffix: true })
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
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setArchiveId(secret.id)}
                      >
                        Archive
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
