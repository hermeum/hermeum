import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { parse, stringify } from "yaml";
import { toast } from "sonner";

import { Button } from "@hermeum/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@hermeum/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@hermeum/components/ui/resizable";
import { useTRPC } from "@/router";
import { AgentInputObjectSchema, AgentInputSchema } from "@/entities";
import type { AgentInput, Template } from "@/entities";
import { AgentConfigChat } from "@/client/ui/components/agent-config-chat";
import { CodeEditor } from "@/client/ui/components/code-editor";

const YAML_OPTIONS = { blockQuote: "literal", lineWidth: 0 } as const;

// The editor pane doubles as the template picker: users browse and preview
// templates there, and only start editing after picking one as the draft.
type EditorView =
  | { mode: "browse" }
  | { mode: "preview"; template: Template }
  | { mode: "edit" };

export const Route = createFileRoute("/agents/new")({
  component: NewAgentPage,
});

function NewAgentPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<EditorView>({ mode: "browse" });
  const [editorValue, setEditorValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: templates } = useQuery(trpc.template.list.queryOptions());

  const { mutate: createAgent, isPending: isCreating } = useMutation(
    trpc.agent.create.mutationOptions({
      onSuccess: (agent) => {
        toast.success("Agent created");
        queryClient.invalidateQueries({ queryKey: trpc.agent.list.queryKey() });
        navigate({ to: "/agents/$id", params: { id: agent.id } });
      },
      onError: (error) => {
        setValidationError(error.message);
      },
    })
  );

  function getConfig(): AgentInput | undefined {
    if (view.mode !== "edit") return undefined;
    let parsed: unknown;
    try {
      parsed = parse(editorValue) ?? {};
    } catch {
      return undefined;
    }
    const result = AgentInputObjectSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  }

  function handleConfigUpdate(config: AgentInput) {
    setEditorValue(stringify(config, YAML_OPTIONS).trim());
    setValidationError(null);
    setView({ mode: "edit" });
  }

  function handleUseTemplate(template: Template) {
    handleConfigUpdate(template.agentInput);
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

  const configPane: ReactNode = (() => {
    if (view.mode === "browse") {
      const visible = templates ?? [];
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <h2 className="shrink-0 text-base font-medium">Start with templates</h2>
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-px sm:grid-cols-2">
            {visible.map((template) => (
              <Card
                key={template.id}
                size="sm"
                onClick={() => setView({ mode: "preview", template })}
                className="cursor-pointer ring-1 ring-border transition-all hover:ring-2 hover:ring-primary"
              >
                <CardHeader>
                  <CardTitle className="text-sm font-medium tracking-normal normal-case">
                    {template.name}
                  </CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    if (view.mode === "preview") {
      const { template } = view;
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Back to templates"
                onClick={() => setView({ mode: "browse" })}
              >
                <ArrowLeft />
              </Button>
              <p className="min-w-0 truncate text-sm font-medium">
                {template.name}
                <span className="text-muted-foreground"> · Template</span>
              </p>
            </div>
            <Button size="sm" onClick={() => handleUseTemplate(template)}>
              Use template
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={stringify(template.agentInput, YAML_OPTIONS).trim()}
              readOnly
              height="100%"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="shrink-0 text-sm font-medium">Agent config</p>
        <div className="min-h-0 flex-1">
          <CodeEditor
            value={editorValue}
            onChange={setEditorValue}
            invalid={!!validationError}
            height="100%"
          />
        </div>
        {validationError && (
          <p className="shrink-0 text-sm text-destructive">{validationError}</p>
        )}
        <div className="flex shrink-0 justify-end gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/agents" })}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? "Creating…" : "Create agent"}
          </Button>
        </div>
      </div>
    );
  })();

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <h1 className="shrink-0 text-2xl font-semibold tracking-tight">Create agent</h1>

      {/* Mobile: static stacked layout (config on top, chat at bottom) */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:hidden">
        <div className="flex min-h-0 flex-1 flex-col">{configPane}</div>
        <div className="flex min-h-0 flex-1 flex-col">
          <AgentConfigChat getConfig={getConfig} onConfigUpdate={handleConfigUpdate} />
        </div>
      </div>

      {/* Desktop: resizable side-by-side layout */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="hidden min-h-0 flex-1 lg:flex"
      >
        {/* Chat pane */}
        <ResizablePanel defaultSize="50%" minSize="25%" className="min-h-0">
          <div className="flex h-full min-h-0 flex-col pr-3">
            <AgentConfigChat getConfig={getConfig} onConfigUpdate={handleConfigUpdate} />
          </div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-transparent [&>div]:opacity-0 [&>div]:transition-opacity hover:[&>div]:opacity-100"
        />

        {/* Config pane */}
        <ResizablePanel defaultSize="50%" minSize="25%" className="min-h-0">
          <div className="flex h-full min-h-0 flex-col pl-3">{configPane}</div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
