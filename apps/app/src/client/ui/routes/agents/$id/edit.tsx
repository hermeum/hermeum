import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { parse, stringify } from "yaml";
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
import { AgentConfigEditor } from "@/client/ui/components/agent-config-editor";
import { AgentEditorMobileTabs } from "../-components/agent-editor-mobile-tabs";
import { AgentPickerBar } from "../-components/agent-picker-bar";

const YAML_OPTIONS = { blockQuote: "literal", lineWidth: 0 } as const;

export const Route = createFileRoute("/agents/$id/edit")({
  component: EditAgentPage,
});

function agentToYaml(agent: unknown): string {
  return stringify(AgentInputObjectSchema.parse(agent), YAML_OPTIONS).trim();
}

function EditAgentPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editorValue, setEditorValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);

  const { data: agent, isPending, error } = useQuery(
    trpc.agent.get.queryOptions({ id })
  );

  // Seed the editor with the existing agent's config once it loads. The draft
  // is what the chat LLM reads/writes, so editing starts from the persisted
  // definition rather than a blank slate.
  useEffect(() => {
    if (agent && !seeded) {
      setEditorValue(agentToYaml(agent));
      setSeeded(true);
    }
  }, [agent, seeded]);

  const { mutate: updateAgent, isPending: isUpdating } = useMutation(
    trpc.agent.update.mutationOptions({
      onSuccess: (updated) => {
        toast.success("Agent updated");
        queryClient.setQueryData(trpc.agent.get.queryKey({ id }), updated);
        queryClient.invalidateQueries({ queryKey: trpc.agent.list.queryKey() });
        navigate({ to: "/agents/$id", params: { id } });
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
    setEditorValue(stringify(config, YAML_OPTIONS).trim());
    setValidationError(null);
  }

  // Merge a user-managed-field patch (agent type / skills / shared env sets)
  // into the current draft.
  function handlePickerChange(patch: {
    type?: string | undefined;
    skills?: string[] | undefined;
    sharedEnvSets?: string[] | undefined;
  }) {
    const current = getConfig();
    if (current === undefined) return;
    handleConfigUpdate({ ...current, ...patch });
  }

  const editChatProps = {
    getConfig,
    onConfigUpdate: handleConfigUpdate,
    emptyTitle: "What should change?",
    emptyDescription: "Describe the change to make.",
    emptyPlaceholder: "Describe the change…",
  };

  function handleSave() {
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
    updateAgent({ id, ...parsed });
  }

  if (isPending) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error.message}</div>;
  if (!agent) return <div className="p-6">Not found</div>;

  const configPane: ReactNode = (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <AgentPickerBar config={getConfig()} onChange={handlePickerChange} />
      <div className="min-h-0 flex-1">
        <AgentConfigEditor
          value={editorValue}
          onChange={setEditorValue}
          invalid={!!validationError}
          height="100%"
          title="Agent config"
          originalValue={agentToYaml(agent)}
        />
      </div>
      {validationError && (
        <p className="shrink-0 text-sm text-destructive">{validationError}</p>
      )}
      <div className="flex shrink-0 justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/agents/$id", params: { id } })}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isUpdating}>
          {isUpdating ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Back to agent"
          onClick={() => navigate({ to: "/agents/$id", params: { id } })}
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit agent
          <span className="text-muted-foreground"> · {agent.name ?? agent.id}</span>
        </h1>
      </div>

      {/* Mobile: tabbed full-height layout */}
      <AgentEditorMobileTabs
        chat={<AgentConfigChat {...editChatProps} />}
        config={configPane}
      />

      {/* Desktop: resizable side-by-side layout */}
      <div className="hidden min-h-0 flex-1 flex-col lg:flex">
        <ResizablePanelGroup orientation="horizontal" className="h-full min-h-0 flex-1">
          {/* Chat pane */}
          <ResizablePanel defaultSize="50%" minSize="25%" className="min-h-0">
            <div className="flex h-full min-h-0 flex-col pr-3">
              <AgentConfigChat {...editChatProps} />
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
    </div>
  );
}