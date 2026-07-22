import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { UIDataTypes, UIMessage } from "ai";
import { ArrowUp, Check, LoaderCircle } from "lucide-react";

import { Button } from "@hermeum/components/ui/button";
import { Bubble, BubbleContent } from "@hermeum/components/ui/bubble";
import { Card, CardDescription, CardHeader, CardTitle } from "@hermeum/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@hermeum/components/ui/dialog";
import { Marker, MarkerContent, MarkerIcon } from "@hermeum/components/ui/marker";
import { Message, MessageContent } from "@hermeum/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@hermeum/components/ui/message-scroller";
import { Textarea } from "@hermeum/components/ui/textarea";
import type { AgentInput, Template } from "@/entities";
import { AgentInputObjectSchema } from "@/entities";

type AgentConfigChatMessage = UIMessage<
  unknown,
  UIDataTypes,
  { updateAgentConfig: { input: AgentInput; output: string } }
>;

interface AgentConfigChatProps {
  // Called at send time so each turn carries the latest editor draft,
  // including hand edits made between messages.
  getConfig: () => AgentInput | undefined;
  // Receives config from both AI tool calls and template picks.
  onConfigUpdate: (config: AgentInput) => void;
  // When non-empty, the empty-chat hero offers a "start with a template"
  // link that opens the template dialog.
  templates?: Template[] | undefined;
}

export function AgentConfigChat({ getConfig, onConfigUpdate, templates }: AgentConfigChatProps) {
  const [input, setInput] = useState("");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const hasTemplates = templates !== undefined && templates.length > 0;

  // Latest-ref so the onToolCall closure (captured once by the Chat
  // instance) never applies updates through a stale callback.
  const callbacksRef = useRef({ getConfig, onConfigUpdate });
  callbacksRef.current = { getConfig, onConfigUpdate };

  const { messages, sendMessage, status, error, addToolOutput } =
    useChat<AgentConfigChatMessage>({
      transport: new DefaultChatTransport({ api: "/chat/agent-config" }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      async onToolCall({ toolCall }) {
        if (toolCall.dynamic || toolCall.toolName !== "updateAgentConfig") return;
        const parsed = AgentInputObjectSchema.safeParse(toolCall.input);
        if (!parsed.success) {
          const issue = parsed.error.issues[0]!;
          addToolOutput({
            tool: "updateAgentConfig",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: `Invalid agent config: ${issue.message} (path: /${issue.path.join("/")})`,
          });
          return;
        }
        callbacksRef.current.onConfigUpdate(parsed.data);
        addToolOutput({
          tool: "updateAgentConfig",
          toolCallId: toolCall.toolCallId,
          output: "Applied to the editor.",
          // The automatic follow-up request should also carry the draft it
          // just produced.
          options: { body: { config: parsed.data } },
        });
      },
    });

  function handleSend() {
    const text = input.trim();
    if (text.length === 0 || status !== "ready") return;
    sendMessage({ text }, { body: { config: callbacksRef.current.getConfig() } });
    setInput("");
  }

  const isBusy = status === "submitted" || status === "streaming";

  function handleSelectTemplate(template: Template) {
    onConfigUpdate(template.agentInput);
    setTemplatesOpen(false);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasTemplates && (
        <TemplateDialog
          templates={templates}
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          onSelect={handleSelectTemplate}
        />
      )}
      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">What should your agent do?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Describe your agent
              {hasTemplates ? (
                <>
                  {" or "}
                  <button
                    type="button"
                    onClick={() => setTemplatesOpen(true)}
                    className="cursor-pointer underline underline-offset-4 hover:text-foreground"
                  >
                    start with a template
                  </button>
                </>
              ) : null}
              .
            </p>
          </div>
        </div>
      ) : (
        <MessageScrollerProvider autoScroll>
          <MessageScroller>
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-3 py-2">
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent>
                        {message.parts.map((part, index) => {
                          if (part.type === "text") {
                            const isUser = message.role === "user";
                            return (
                              <Bubble
                                key={index}
                                variant={isUser ? "muted" : "ghost"}
                                align={isUser ? "end" : "start"}
                              >
                                <BubbleContent className="whitespace-pre-wrap">
                                  {part.text}
                                </BubbleContent>
                              </Bubble>
                            );
                          }
                          if (part.type === "tool-updateAgentConfig") {
                            return (
                              <Marker key={index}>
                                <MarkerIcon>
                                  {part.state === "output-available" ? (
                                    <Check />
                                  ) : (
                                    <LoaderCircle className="animate-spin" />
                                  )}
                                </MarkerIcon>
                                <MarkerContent>
                                  {part.state === "output-error"
                                    ? "Config update failed"
                                    : "Config updated"}
                                </MarkerContent>
                              </Marker>
                            );
                          }
                          return null;
                        })}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
                {status === "submitted" && (
                  <MessageScrollerItem messageId="thinking">
                    <span className="shimmer text-sm">Thinking…</span>
                  </MessageScrollerItem>
                )}
                {error && (
                  <MessageScrollerItem messageId="error">
                    <p className="text-sm text-destructive">{error.message}</p>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      <div className="shrink-0 rounded-[0.25rem] border p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={messages.length === 0 ? "Describe your agent…" : "Reply…"}
          className="min-h-16 border-transparent px-0 py-0 focus-visible:border-transparent"
        />
        <div className="flex justify-end">
          <Button
            size="icon-sm"
            aria-label="Send message"
            onClick={handleSend}
            disabled={input.trim().length === 0 || isBusy}
          >
            {isBusy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateDialog({
  templates,
  open,
  onOpenChange,
  onSelect,
}: {
  templates: Template[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: Template) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>Pick a starting point for the agent config.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-px">
          {templates.map((template) => (
            <Card
              key={template.id}
              size="sm"
              onClick={() => onSelect(template)}
              className="cursor-pointer ring-1 ring-border transition-all hover:ring-2 hover:ring-primary"
            >
              <CardHeader>
                <CardTitle className="text-base">{template.name}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
