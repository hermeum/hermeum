import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@hermeum/components/ui/button";
import { Card, CardContent } from "@hermeum/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hermeum/components/ui/dialog";
import { Skeleton } from "@hermeum/components/ui/skeleton";
import { Textarea } from "@hermeum/components/ui/textarea";

import { useTRPC } from "@/router";
import type { Agent, AgentMemoryEntry } from "@/entities";

// Operator view of the agent's Hermeum-managed memory. Entries live on the
// control plane, so they stay visible and editable while the agent is down;
// the agent picks up changes on its next turn (prefetch re-reads the list).
// Archived agents are read-only, matching the rest of the detail page.
export function MemoryTab({ agent }: { agent: Agent }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const agentId = agent.id;
  const readOnly = agent.archived === true;
  // An empty provider means the agent predates (or skipped) the HermeumMemory
  // pin; redeploying re-applies the managed aspects and injects "hermeum".
  const needsRedeploy = agent.config?.memory?.provider;
  const {
    data: entries,
    isPending,
    error,
  } = useQuery(trpc.agentMemory.list.queryOptions({ agentId }));

  const [newContent, setNewContent] = useState("");
  const [editing, setEditing] = useState<AgentMemoryEntry | null>(null);
  const [editContent, setEditContent] = useState("");
  const [removing, setRemoving] = useState<AgentMemoryEntry | null>(null);

  // Mutations return the updated entry list, so seed the list cache directly
  // (no refetch) and let other views invalidate if they need to.
  const storeEntries = (updated: AgentMemoryEntry[]) =>
    queryClient.setQueryData(trpc.agentMemory.list.queryKey({ agentId }), updated);

  const { mutate: addEntry, isPending: isAdding } = useMutation(
    trpc.agentMemory.add.mutationOptions({
      onSuccess: (updated) => {
        storeEntries(updated);
        setNewContent("");
        toast.success("Memory entry added");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const { mutate: patchEntry, isPending: isPatching } = useMutation(
    trpc.agentMemory.patch.mutationOptions({
      onSuccess: (updated) => {
        storeEntries(updated);
        setEditing(null);
        toast.success("Memory entry updated");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const { mutate: removeEntry, isPending: isRemoving } = useMutation(
    trpc.agentMemory.remove.mutationOptions({
      onSuccess: (updated) => {
        storeEntries(updated);
        setRemoving(null);
        toast.success("Memory entry removed");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  // Redeploy only fixes the provider pin; the agent detail query carries the
  // config, so refetch it to hide the prompt once the provider is set.
  const { mutate: redeployAgent, isPending: isRedeploying } = useMutation(
    trpc.agent.redeploy.mutationOptions({
      onSuccess: () => {
        toast.success("Agent redeployed");
        queryClient.invalidateQueries({ queryKey: trpc.agent.get.queryKey({ id: agentId }) });
      },
      onError: (e) => toast.error(e.message),
    })
  );

  // Until the provider is pinned, the agent can't read memory, so the entry
  // editor would be inert. Surface only the healing action in that state.
  if (needsRedeploy) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Memory provider isn&apos;t configured</p>
              <p className="text-sm text-muted-foreground">
                Redeploy this agent to activate Hermeum memory so it can read these entries.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={isRedeploying || readOnly}
                onClick={() => redeployAgent({ id: agentId })}
              >
                <RefreshCw className={`size-4 ${isRedeploying ? "animate-spin" : ""}`} />
                Redeploy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (error) {
    return <p className="text-sm text-red-500">Error: {error.message}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <Textarea
              value={newContent}
              onChange={(event) => setNewContent(event.target.value)}
              placeholder="Add a memory entry — a fact, convention, or lesson the agent should keep."
              rows={3}
              aria-label="New memory entry"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={isAdding || newContent.trim() === ""}
                onClick={() => addEntry({ agentId, content: newContent })}
              >
                <Plus className="size-4" />
                Add entry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No memory entries yet.{" "}
          {readOnly
            ? "This agent has no memory."
            : "Add one above — memory is operator-authored; the agent only reads it."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <p className="text-sm whitespace-pre-wrap break-words">{entry.content}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(entry.updatedAt).toLocaleString()}
                    </span>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(entry);
                            setEditContent(entry.content);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setRemoving(entry)}>
                          <Trash2 className="size-4" />
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit memory entry</DialogTitle>
            <DialogDescription>
              The entry is stored in Hermeum; the agent sees the change on its next turn.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(event) => setEditContent(event.target.value)}
            rows={6}
            aria-label="Memory entry content"
          />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={isPatching || editContent.trim() === ""}
              onClick={() => {
                if (editing) patchEntry({ agentId, id: editing.id, content: editContent });
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove memory entry</DialogTitle>
            <DialogDescription>
              This permanently deletes the entry from the agent&apos;s memory.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap break-words">
            {removing?.content}
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={isRemoving}
              onClick={() => {
                if (removing) removeEntry({ agentId, id: removing.id });
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
