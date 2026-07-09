import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parse } from "yaml";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { useTRPC } from "@/router";
import type { Agent, AgentInput } from "@/entities";
import { AgentInputObjectSchema, AgentInputSchema } from "@/entities";
import { CodeEditor } from "@/client/ui/components/code-editor";
import { stringifyAgentInput } from "@/client/ui/components/agent-yaml";
import { Button } from "@hermeum/components/ui/button";
import { Textarea } from "@hermeum/components/ui/textarea";
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
  return stringifyAgentInput(AgentInputObjectSchema.parse(agent));
}

export function EditInstanceDialog({ instance, open, onOpenChange }: EditInstanceDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editorValue, setEditorValue] = useState(() => agentToYaml(instance));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [previousValue, setPreviousValue] = useState<string | null>(null);

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

  const { mutate: reviseAgent, isPending: isRevising } = useMutation(
    trpc.agentConfig.update.mutationOptions({
      onSuccess: (revised) => {
        setPreviousValue(editorValue);
        setEditorValue(stringifyAgentInput(revised));
        setPrompt("");
        setValidationError(null);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEditorValue(agentToYaml(instance));
      setValidationError(null);
      setPrompt("");
      setPreviousValue(null);
    }
    onOpenChange(nextOpen);
  }

  // Parses the editor content, surfacing errors via `validationError`.
  // `schema` differs by caller: revise accepts drafts (object schema only),
  // save requires the full refined schema.
  function parseEditor(
    schema: typeof AgentInputObjectSchema | typeof AgentInputSchema
  ): AgentInput | null {
    let parsed: unknown;
    try {
      parsed = parse(editorValue) ?? {};
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Invalid YAML");
      return null;
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const path = issue.path.length > 0 ? `/${issue.path.join("/")}` : "";
      setValidationError(`${issue.message} (path: ${path})`);
      return null;
    }

    setValidationError(null);
    return result.data;
  }

  function handleRevise() {
    if (prompt.trim().length === 0 || isRevising) return;
    const config = parseEditor(AgentInputObjectSchema);
    if (!config) return;
    reviseAgent({ prompt: prompt.trim(), config });
  }

  function handleUndoRevision() {
    if (previousValue === null) return;
    setEditorValue(previousValue);
    setPreviousValue(null);
    setValidationError(null);
  }

  function handleSave() {
    const config = parseEditor(AgentInputSchema);
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

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto space-y-2">
          <CodeEditor
            value={editorValue}
            onChange={setEditorValue}
            readOnly={isRevising}
            invalid={!!validationError}
            maxHeight="360px"
          />
          {validationError && <p className="text-sm text-destructive">{validationError}</p>}

          <div className="rounded-[0.25rem] border p-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleRevise();
                }
              }}
              placeholder="Ask AI to change something…"
              className="min-h-9 border-transparent px-0 py-0 focus-visible:border-transparent"
            />
            <div className="flex justify-end gap-2">
              {previousValue !== null && (
                <Button variant="ghost" size="xs" onClick={handleUndoRevision}>
                  Undo revision
                </Button>
              )}
              <Button
                variant="outline"
                size="xs"
                onClick={handleRevise}
                disabled={prompt.trim().length === 0 || isRevising}
              >
                {isRevising && <LoaderCircle className="animate-spin" />}
                {isRevising ? "Revising…" : "Revise"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={handleSave} disabled={isUpdating || isRevising}>
            {isUpdating ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
