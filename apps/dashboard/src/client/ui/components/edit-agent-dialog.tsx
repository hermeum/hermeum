import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parse, stringify } from "yaml";
import { toast } from "sonner";
import { useTRPC } from "@/router";
import type { Agent, AgentInput } from "@/entities";
import { AgentInputObjectSchema, AgentInputSchema } from "@/entities";
import { CodeEditor } from "@/client/ui/components/code-editor";
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

interface EditInstanceDialogProps {
  instance: Agent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function agentToYaml(agent: Agent): string {
  return stringify(AgentInputObjectSchema.parse(agent), {
    blockQuote: "literal",
    lineWidth: 0,
  }).trim();
}

export function EditInstanceDialog({ instance, open, onOpenChange }: EditInstanceDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editorValue, setEditorValue] = useState(() => agentToYaml(instance));
  const [validationError, setValidationError] = useState<string | null>(null);

  const { mutate: updateAgent, isPending: isUpdating } = useMutation(
    trpc.agent.update.mutationOptions({
      onSuccess: (updated) => {
        toast.success("Agent updated");
        queryClient.setQueryData(trpc.agent.get.queryKey({ id: instance.id }), updated);
        queryClient.invalidateQueries({ queryKey: trpc.agent.list.queryKey() });
        handleOpenChange(false);
      },
      onError: (error) => {
        setValidationError(error.message);
      },
    })
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEditorValue(agentToYaml(instance));
      setValidationError(null);
    }
    onOpenChange(nextOpen);
  }

  // Parses the editor content, surfacing errors via `validationError`.
  function parseEditor(): AgentInput | null {
    let parsed: unknown;
    try {
      parsed = parse(editorValue) ?? {};
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Invalid YAML");
      return null;
    }

    const result = AgentInputSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const path = issue.path.length > 0 ? `/${issue.path.join("/")}` : "";
      setValidationError(`${issue.message} (path: ${path})`);
      return null;
    }

    setValidationError(null);
    return result.data;
  }

  function handleSave() {
    const config = parseEditor();
    if (!config) return;
    updateAgent({ id: instance.id, ...config });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-2xl max-h-[min(600px,calc(100dvh-4rem))]">
        <DialogHeader>
          <DialogTitle>Edit agent</DialogTitle>
          <DialogDescription>
            Update the configuration for{" "}
            <span className="font-medium">{instance.name ?? instance.id}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto space-y-2 p-px">
          <CodeEditor
            value={editorValue}
            onChange={setEditorValue}
            invalid={!!validationError}
            maxHeight="360px"
          />
          {validationError && <p className="text-sm text-destructive">{validationError}</p>}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
