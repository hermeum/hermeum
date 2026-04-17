import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useTRPC } from "@/router";
import { CopyButton } from "@/client/ui/components/copy-button";
import { EditSecretDialog } from "@/client/ui/components/edit-secret-dialog";
import { EnvVarDialog } from "@/client/ui/components/env-var-dialog";
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

export const Route = createFileRoute("/secrets/$id")({
  component: SecretDetailPage,
});

function SecretDetailPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.secret.get.queryKey({ id });

  const navigate = useNavigate();
  const { data: secret, isPending, error } = useQuery(trpc.secret.get.queryOptions({ id }));

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const { mutate: addEnvVar, isPending: isAdding } = useMutation(
    trpc.secret.addEnvVar.mutationOptions({
      onSuccess: () => {
        invalidate();
        setAddOpen(false);
        setAddError(null);
      },
      onError: (e) => setAddError(e.message),
    })
  );

  const { mutate: archiveSecret, isPending: isArchiving } = useMutation(
    trpc.secret.archive.mutationOptions({
      onSuccess: () => navigate({ to: "/secrets" }),
    })
  );

  const { mutate: removeEnvVar } = useMutation(
    trpc.secret.removeEnvVar.mutationOptions({ onSuccess: invalidate })
  );

  if (isPending) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-destructive">Error: {error.message}</div>;
  if (!secret) return <div className="p-6">Not found</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{secret.name}</h1>
            <Badge variant="secondary">{secret.archived ? "Archived" : "Active"}</Badge>
          </div>
          <div className="group flex items-center gap-1">
            <p className="font-mono text-sm text-muted-foreground">{secret.id}</p>
            <CopyButton text={secret.id} className="opacity-0 group-hover:opacity-100" />
          </div>
          {secret.description && (
            <p className="mt-1 text-sm text-muted-foreground">{secret.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="More actions" />}
            >
              <Button variant="outline" size="icon" aria-label="Open actions menu">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onClick={() => setArchiveOpen(true)}>
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Environment variables</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddError(null);
              setAddOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            Add env
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {secret.envVars.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground">
                  No environment variables yet.
                </TableCell>
              </TableRow>
            ) : (
              secret.envVars.map((v) => (
                <TableRow key={v.name}>
                  <TableCell className="font-mono text-xs">{v.name}</TableCell>
                  <TableCell className="w-10">
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
                          onClick={() => removeEnvVar({ secretId: id, name: v.name })}
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

      <EditSecretDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        secretId={id}
        initial={{
          name: secret.name,
          ...(secret.description && { description: secret.description }),
        }}
      />

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Archive secret</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive this secret? It will no longer appear in the list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={isArchiving}
              onClick={() => archiveSecret({ id })}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EnvVarDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isPending={isAdding}
        error={addError}
        onSubmit={(envVar) => addEnvVar({ secretId: id, envVar })}
      />
    </div>
  );
}
