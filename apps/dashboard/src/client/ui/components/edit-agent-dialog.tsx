import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { stringify, parse } from "yaml";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { useTRPC } from "@/router";
import type { Instance } from "@/entities";
import { InstanceInputSchema } from "@/entities";
import { cn } from "@kubeclaw/components/lib/utils";
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

interface EditInstanceDialogProps {
  instance: Instance;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function instanceToYaml(instance: Instance): string {
  const { id, suspended, phase, createdAt, ...input } = instance;
  return stringify(input);
}

export function EditInstanceDialog({ instance, open, onOpenChange }: EditInstanceDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editorValue, setEditorValue] = useState(() => instanceToYaml(instance));
  const [validationError, setValidationError] = useState<string | null>(null);

  const { mutate: updateInstance, isPending: isUpdating } = useMutation(
    trpc.instance.update.mutationOptions({
      onSuccess: (updated) => {
        queryClient.setQueryData(trpc.instance.get.queryKey({ id: instance.id }), updated);
        queryClient.invalidateQueries({ queryKey: trpc.instance.list.queryKey() });
        handleOpenChange(false);
      },
      onError: (error) => {
        setValidationError(error.message);
      },
    })
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEditorValue(instanceToYaml(instance));
      setValidationError(null);
    }
    onOpenChange(nextOpen);
  }

  function handleSave() {
    let parsed: Record<string, unknown>;
    try {
      parsed = (parse(editorValue) ?? {}) as Record<string, unknown>;
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Invalid YAML");
      return;
    }

    const result = InstanceInputSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const path = issue.path.length > 0 ? `/${issue.path.join("/")}` : "";
      setValidationError(`${issue.message} (path: ${path})`);
      return;
    }

    setValidationError(null);
    updateInstance({ id: instance.id, ...parsed });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-xl max-h-[min(600px,calc(100dvh-4rem))]">
        <DialogHeader>
          <DialogTitle>Edit agent</DialogTitle>
          <DialogDescription>
            Update the configuration for{" "}
            <span className="font-medium">{instance.agentName ?? instance.id}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
          <CodeMirror
            value={editorValue}
            extensions={[yamlLang()]}
            onChange={setEditorValue}
            className={cn(
              "overflow-hidden rounded-lg border text-sm [&_.cm-content]:outline-none [&_.cm-editor.cm-focused]:outline-none",
              validationError && "border-destructive"
            )}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              searchKeymap: false,
              autocompletion: false,
              lintKeymap: false,
            }}
            height="500px"
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
