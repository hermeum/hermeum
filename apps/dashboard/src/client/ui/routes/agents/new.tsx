import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { parse } from "yaml";
import { toast } from "sonner";

import { cn } from "@hermeum/components/lib/utils";
import { Button } from "@hermeum/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@hermeum/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hermeum/components/ui/tabs";
import { useTRPC } from "@/router";
import type { Template } from "@/entities";
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
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
    setSelectedTemplateId(null);
    setValidationError(null);
  }

  function handleSelectTemplate(template: Template) {
    setSelectedTemplateId(template.id);
    setEditorValue(stringifyAgentInput(template.agentInput));
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
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Create agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start from a template or workshop the config with AI.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chat / template pane */}
        <Tabs defaultValue="describe" className="flex min-h-0 flex-col">
          <TabsList className="w-full shrink-0">
            <TabsTrigger value="describe">Describe your agent</TabsTrigger>
            <TabsTrigger value="template">Template</TabsTrigger>
          </TabsList>

          <TabsContent value="describe" className="flex min-h-0 flex-1 flex-col">
            <AgentConfigChat getConfig={getConfig} onConfigUpdate={handleConfigUpdate} />
          </TabsContent>

          <TabsContent value="template" className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 px-1 py-2">
              {templates?.map((template) => (
                <Card
                  key={template.id}
                  size="sm"
                  onClick={() => handleSelectTemplate(template)}
                  className={cn(
                    "cursor-pointer transition-all",
                    selectedTemplateId === template.id ? "ring-2 ring-primary" : "ring-1 ring-border"
                  )}
                >
                  <CardHeader>
                    <CardTitle className="text-base">{template.name}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Config pane */}
        <div className="flex min-h-0 flex-col gap-2">
          <p className="shrink-0 text-sm font-medium">Agent config</p>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <CodeEditor value={editorValue} onChange={setEditorValue} invalid={!!validationError} />
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
      </div>
    </div>
  );
}
