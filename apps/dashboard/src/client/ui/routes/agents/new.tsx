import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parse } from "yaml";
import { toast } from "sonner";

import { Button } from "@hermeum/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@hermeum/components/ui/resizable";
import { useTRPC } from "@/router";
import { AgentInputObjectSchema, AgentInputSchema } from "@/entities";
import type { AgentInput } from "@/entities";
import { AgentConfigChat } from "@/client/ui/components/agent-config-chat";
import { CodeEditor } from "@/client/ui/components/code-editor";
import { stringifyAgentInput } from "@/client/ui/components/agent-yaml";

const DEFAULT_YAML = stringifyAgentInput({
  name: "Untitled agent",
  description: "A blank starting point with the core toolset.",
  soul: `You are a team agent that can research, write code, run commands, and use tools to help the team end to end.`,
  config: {
    model: {
      provider: "anthropic",
      default: "claude-sonnet-5",
    },
  },
  env: [],
  skills: [],
  plugins: [],
  sharedEnvSets: [],
});

export const Route = createFileRoute("/agents/new")({
  component: NewAgentPage,
});

function NewAgentPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editorValue, setEditorValue] = useState(DEFAULT_YAML);
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
    setEditorValue(stringifyAgentInput(config));
    setValidationError(null);
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
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <h1 className="shrink-0 text-2xl font-semibold tracking-tight">Create agent</h1>

      {/* Mobile: static stacked layout (config on top, chat at bottom) */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:hidden">
        <div className="flex flex-col gap-2">
          <p className="shrink-0 text-sm font-medium">Agent config</p>
          <div className="min-h-0 flex-1">
            <CodeEditor
              value={editorValue}
              onChange={setEditorValue}
              invalid={!!validationError}
              height="300px"
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
        <div className="flex min-h-0 flex-1 flex-col">
          <AgentConfigChat
            getConfig={getConfig}
            onConfigUpdate={handleConfigUpdate}
            templates={templates}
          />
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
            <AgentConfigChat
              getConfig={getConfig}
              onConfigUpdate={handleConfigUpdate}
              templates={templates}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-transparent [&>div]:opacity-0 [&>div]:transition-opacity hover:[&>div]:opacity-100"
        />

        {/* Config pane */}
        <ResizablePanel defaultSize="50%" minSize="25%" className="min-h-0">
          <div className="flex h-full min-h-0 flex-col gap-2 pl-3">
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
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
