import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/router";
import { CopyButton } from "@/client/ui/components/copy-button";
import { EditSharedEnvSetDialog } from "./-components/edit-shared-env-set-dialog";
import { EnvVarDialog } from "./-components/env-var-dialog";
import { Badge } from "@hermeum/components/ui/badge";
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

export const Route = createFileRoute("/shared-env-sets/$id")({
  component: SharedEnvSetDetailPage,
});

function SharedEnvSetDetailPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const queryKey = trpc.sharedEnvSet.get.queryKey({ id });

  const navigate = useNavigate();
  const { data: envSet, isPending, error } = useQuery(trpc.sharedEnvSet.get.queryOptions({ id }));

  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteEnvVarName, setDeleteEnvVarName] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const { mutate: addEnvVar, isPending: isAdding } = useMutation(
    trpc.sharedEnvSet.addEnvVar.mutationOptions({
      onSuccess: () => {
        toast.success("Env var added");
        invalidate();
        setAddOpen(false);
        setAddError(null);
      },
      onError: (e) => setAddError(e.message),
    })
  );

  const { mutate: archiveEnvSet, isPending: isArchiving } = useMutation(
    trpc.sharedEnvSet.archive.mutationOptions({
      onSuccess: () => {
        toast.success("Shared env set archived");
        navigate({ to: "/shared-env-sets" });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const { mutate: removeEnvVar, isPending: isRemoving } = useMutation(
    trpc.sharedEnvSet.removeEnvVar.mutationOptions({
      onSuccess: () => {
        toast.success("Env var deleted");
        invalidate();
        setDeleteEnvVarName(null);
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (isPending) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-destructive">Error: {error.message}</div>;
  if (!envSet) return <div className="p-6">Not found</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{envSet.name}</h1>
            <Badge>{envSet.archived ? "Archived" : "Active"}</Badge>
          </div>
          <div className="group flex items-center gap-1">
            <p className="font-mono text-sm text-muted-foreground">{envSet.id}</p>
            <CopyButton text={envSet.id} className="opacity-0 group-hover:opacity-100" />
          </div>
          {envSet.description && (
            <p className="mt-1 text-sm text-muted-foreground">{envSet.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!envSet.archived && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
          {!envSet.archived && (
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
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Environment variables</h2>
          {!envSet.archived && (
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
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {envSet.envVars.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-muted-foreground">
                  No environment variables yet.
                </TableCell>
              </TableRow>
            ) : (
              envSet.envVars.map((v) => (
                <TableRow key={v.name}>
                  <TableCell className="font-mono text-xs">{v.name}</TableCell>
                  <TableCell className="w-10">
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
                            onClick={() => setDeleteEnvVarName(v.name)}
                          >
                            Delete
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
      </div>

      <EditSharedEnvSetDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        setId={id}
        initial={{
          name: envSet.name,
          ...(envSet.description && { description: envSet.description }),
        }}
      />

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
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
              onClick={() => archiveEnvSet({ id })}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteEnvVarName !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteEnvVarName(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete env var</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-mono font-medium">{deleteEnvVarName}</span>? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={isRemoving}
              onClick={() => {
                if (deleteEnvVarName) removeEnvVar({ setId: id, name: deleteEnvVarName });
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EnvVarDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isPending={isAdding}
        error={addError}
        onSubmit={(envVar) => addEnvVar({ setId: id, envVar })}
      />
    </div>
  );
}
