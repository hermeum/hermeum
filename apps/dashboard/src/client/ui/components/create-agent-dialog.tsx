import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Document, parse, Scalar } from "yaml";

import { LoaderCircle } from "lucide-react";

import { cn } from "@hermeum/components/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@hermeum/components/ui/collapsible";
import { Button } from "@hermeum/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@hermeum/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@hermeum/components/ui/tabs";
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
import { toast } from "sonner";
import { useTRPC } from "@/router";
import type { Template, AgentInput } from "@/entities";
import { AgentInputSchema } from "@/entities";
import { CodeEditor } from "@/client/ui/components/code-editor";

// Renders `soul` as a literal block (`|`) instead of yaml's default folded
// style (`>-`), which collapses newlines into blank-line-separated runs and
// hard-wraps lines — unreadable for multi-paragraph markdown.
function stringifyAgentInput(input: AgentInput): string {
  const doc = new Document(input);
  const soul = doc.get("soul", true);
  if (soul instanceof Scalar && typeof soul.value === "string") {
    soul.type = Scalar.BLOCK_LITERAL;
  }
  return doc.toString().trim();
}

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
  const [quickStartOpen, setQuickStartOpen] = useState(true);
  const [quickStartTab, setQuickStartTab] = useState<"describe" | "template">("describe");
  const [description, setDescription] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const { data: templates } = useQuery(trpc.template.list.queryOptions());

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

  const { mutate: generateAgent, isPending: isGenerating } = useMutation(
    trpc.agentConfig.create.mutationOptions({
      onSuccess: (agentInput) => {
        setEditorValue(stringifyAgentInput(agentInput));
        setSelectedTemplateId(null);
        setValidationError(null);
        setSelectedName(agentInput.name ?? null);
        setQuickStartOpen(false);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setEditorValue(DEFAULT_YAML);
      setSelectedTemplateId(null);
      setValidationError(null);
      setQuickStartOpen(true);
      setQuickStartTab("describe");
      setDescription("");
      setSelectedName(null);
    }
    onOpenChange(nextOpen);
  }

  function handleSelectTemplate(template: Template) {
    setSelectedTemplateId(template.id);
    setEditorValue(stringifyAgentInput(template.agentInput));
    setSelectedName(template.name);
    setQuickStartOpen(false);
  }

  function handleGenerate() {
    if (description.trim().length === 0 || isGenerating) return;
    generateAgent({ prompt: description.trim() });
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
      <DialogContent className="flex flex-col sm:max-w-2xl max-h-[min(700px,calc(100dvh-4rem))]">
        <DialogHeader>
          <DialogTitle>Create agent</DialogTitle>
          <DialogDescription>Start from a template or describe what you need.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto space-y-4">
          {/* Starting point section */}
          <Collapsible open={quickStartOpen} onOpenChange={setQuickStartOpen}>
            <CollapsibleTrigger>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span>Quick start</span>
                {selectedName && (
                  <span className="truncate font-normal text-muted-foreground">
                    · {selectedName}
                  </span>
                )}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="pb-2">
              <Tabs
                value={quickStartTab}
                onValueChange={(value) => setQuickStartTab(value as "describe" | "template")}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="describe">Describe your agent</TabsTrigger>
                  <TabsTrigger value="template">Template</TabsTrigger>
                </TabsList>

                <TabsContent value="describe">
                  <div className="rounded-[0.25rem] border p-3">
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleGenerate();
                        }
                      }}
                      placeholder="Reviews new pull requests and leaves inline comments on risky changes."
                      className="min-h-24 border-transparent px-0 py-0 focus-visible:border-transparent"
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={handleGenerate}
                        disabled={description.trim().length === 0 || isGenerating}
                      >
                        {isGenerating && <LoaderCircle className="animate-spin" />}
                        {isGenerating ? "Generating…" : "Generate"}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="template">
                  <div className="grid grid-cols-2 gap-3 px-1 py-2">
                    {templates?.map((template) => (
                      <Card
                        key={template.id}
                        size="sm"
                        onClick={() => handleSelectTemplate(template)}
                        className={cn(
                          "cursor-pointer transition-all",
                          selectedTemplateId === template.id
                            ? "ring-2 ring-primary"
                            : "ring-1 ring-border"
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
            </CollapsibleContent>
          </Collapsible>

          {/* Agent config section */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Agent config</p>
            <CodeEditor
              value={editorValue}
              onChange={setEditorValue}
              invalid={!!validationError}
              maxHeight={quickStartOpen ? "220px" : "560px"}
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
