import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { stringify, parse } from "yaml";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";

import { cn } from "@hermeum/components/lib/utils";
import { Button } from "@hermeum/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@hermeum/components/ui/card";
import { ScrollArea, ScrollBar } from "@hermeum/components/ui/scroll-area";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@hermeum/components/ui/dialog";
import { toast } from "sonner";
import { useTRPC } from "@/router";
import type { Template, AgentInput } from "@/entities";
import { AgentInputSchema } from "@/entities";

const DEFAULT_YAML = stringify({
  name: "Untitled agent",
  config: {
    agents: {
      defaults: {
        model: {
          primary: "anthropic/claude-opus-4-6",
        },
      },
    },
  },
  soul: `## Identity
You are a helpful assistant. Your goal is to answer questions clearly
and concisely, help with tasks, and make the user's work easier.

## Core Principles
- Ask for clarification when a request is ambiguous.
- Admit when you don't know something rather than guessing.`,
  skills: [],
  plugins: [],
} as AgentInput);

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateAgentDialog({ open, onOpenChange, onSuccess }: CreateAgentDialogProps) {
  const trpc = useTRPC();
  const [editorValue, setEditorValue] = useState(DEFAULT_YAML);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: templates } = useQuery(trpc.template.list.queryOptions());

  useEffect(() => {
    if (templates && templates.length > 0 && selectedTemplateId === null) {
      handleSelectTemplate(templates[0]!);
    }
  }, [templates]);

  const { mutate: createAgent, isPending: isCreating } = useMutation(
    trpc.agent.create.mutationOptions({
      onSuccess: () => {
        toast.success("Agent created");
        onSuccess();
        handleOpenChange(false);
      },
      onError: (error) => {
        setValidationError(error.message);
      },
    })
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEditorValue(DEFAULT_YAML);
      setSelectedTemplateId(null);
      setValidationError(null);
    }
    onOpenChange(nextOpen);
  }

  function handleSelectTemplate(template: Template) {
    setSelectedTemplateId(template.id);
    setEditorValue(stringify(template.agentInput));
  }

  function handleCreate() {
    let parsed: Record<string, unknown>;
    try {
      parsed = (parse(editorValue) ?? {}) as Record<string, unknown>;
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : "Invalid YAML");
      return;
    }

    const result = AgentInputSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0]!;
      const path = issue.path.length > 0 ? `/${issue.path.join("/")}` : "";
      setValidationError(`${issue.message} (path: ${path})`);
      return;
    }

    setValidationError(null);
    createAgent(parsed);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-xl max-h-[min(700px,calc(100dvh-4rem))]">
        <DialogHeader>
          <DialogTitle>Create agent</DialogTitle>
          <DialogDescription>Start from a template or describe what you need.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4">
          {/* Template section */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Template</p>
            <ScrollArea className="w-full">
              <div className="flex gap-2 px-1 py-2">
                {templates?.map((template) => (
                  <Card
                    key={template.id}
                    size="sm"
                    onClick={() => handleSelectTemplate(template)}
                    className={cn(
                      "w-64 shrink-0 cursor-pointer transition-all",
                      selectedTemplateId === template.id
                        ? "ring-2 ring-primary"
                        : "ring-1 ring-border"
                    )}
                  >
                    <CardHeader>
                      <CardTitle>{template.name}</CardTitle>
                      <CardDescription>{template.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Agent config section */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Agent config</p>
            <CodeMirror
              value={editorValue}
              extensions={[yamlLang(), indentationMarkers()]}
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
              height="360px"
            />
            {validationError && <p className="text-sm text-destructive">{validationError}</p>}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating…" : "Create agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
