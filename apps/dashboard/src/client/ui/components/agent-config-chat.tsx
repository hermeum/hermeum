import { useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { UIDataTypes, UIMessage } from "ai";
import { ArrowUp, Check, LoaderCircle } from "lucide-react";

import { Button } from "@hermeum/components/ui/button";
import { Bubble, BubbleContent } from "@hermeum/components/ui/bubble";
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
import type { AgentInput } from "@/entities";
import { AgentInputObjectSchema } from "@/entities";

// Mirrors the server-executed tools declared in ChatUseCase.getAgentConfigContext
// so the UI can render their lifecycle as markers alongside the client tools.
type ReadDocumentOutput = {
  documents: Array<{ name: string; content: string } | { name: string; error: string }>;
};
type ReadSharedEnvSetOutput = {
  sharedEnvSets: Array<{ id: string; envVars: { name: string }[] } | { id: string; error: string }>;
};
type SearchSkillsOutput = { results: { name: string; identifier: string; description: string }[] };

type AgentConfigChatMessage = UIMessage<
  unknown,
  UIDataTypes,
  {
    // Client-executed (handled in onToolCall).
    updateAgentConfig: { input: AgentInput; output: string };
    readAgentConfig: { input: undefined; output: AgentInput | undefined };
    // Server-executed (lifecycle only — no client handler).
    readDocument: { input: { names: string[] }; output: ReadDocumentOutput };
    readSharedEnvSet: { input: { ids: string[] }; output: ReadSharedEnvSetOutput };
    searchSkills: { input: { query: string; limit?: number }; output: SearchSkillsOutput };
  }
>;

interface AgentConfigChatProps {
  // Called at send time so each turn carries the latest editor draft,
  // including hand edits made between messages.
  getConfig: () => AgentInput | undefined;
  // Receives config from AI tool calls.
  onConfigUpdate: (config: AgentInput) => void;
}

// Renders the lifecycle of any tool call as a single inline status marker.
// Running while input is streaming/available, done when output arrives,
// error when the tool errors.
//
// `transient` markers only appear while the tool is running (input-streaming,
// input-available, or any approval state). Once the tool finishes they disappear,
// so the chat stays focused on the conversation. Only config-changing tools
// should be persistent.
//
// Styling is deliberately softened: normal case, normal tracking, and a lighter
// weight so the markers feel like quiet activity rather than loud status alerts.
type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

function ToolMarker({
  state,
  runningLabel,
  doneLabel,
  errorLabel,
  transient = false,
}: {
  state: ToolPartState;
  runningLabel: string;
  doneLabel: string;
  errorLabel: string;
  transient?: boolean;
}) {
  const isDone = state === "output-available";
  const isError = state === "output-error" || state === "output-denied";

  if (transient && (isDone || isError)) {
    return null;
  }

  return (
    <Marker className="normal-case tracking-normal font-normal">
      <MarkerIcon>
        {isDone ? <Check /> : <LoaderCircle className="animate-spin" />}
      </MarkerIcon>
      <MarkerContent className="normal-case tracking-normal">
        {isError ? errorLabel : isDone ? doneLabel : runningLabel}
      </MarkerContent>
    </Marker>
  );
}

export function AgentConfigChat({ getConfig, onConfigUpdate }: AgentConfigChatProps) {
  const [input, setInput] = useState("");

  // Latest-ref so the onToolCall closure (captured once by the Chat
  // instance) never applies updates through a stale callback.
  const callbacksRef = useRef({ getConfig, onConfigUpdate });
  callbacksRef.current = { getConfig, onConfigUpdate };

  const { messages, sendMessage, status, error, addToolOutput } =
    useChat<AgentConfigChatMessage>({
      transport: new DefaultChatTransport({ api: "/chat/agent-config" }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      async onToolCall({ toolCall }) {
        if (toolCall.dynamic) return;
        if (toolCall.toolName === "readAgentConfig") {
          const config = callbacksRef.current.getConfig();
          addToolOutput({
            tool: "readAgentConfig",
            toolCallId: toolCall.toolCallId,
            output: config,
          });
          return;
        }
        if (toolCall.toolName !== "updateAgentConfig") return;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">What should your agent do?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Describe your agent or start with a template.</p>
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
                          if (part.type === "tool-readAgentConfig") {
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel="Reading the latest config…"
                                doneLabel="Read the latest config"
                                errorLabel="Couldn’t read the latest config"
                                transient
                              />
                            );
                          }
                          if (part.type === "tool-updateAgentConfig") {
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel="Updating the config…"
                                doneLabel="Config updated"
                                errorLabel="Couldn’t update the config"
                              />
                            );
                          }
                          if (part.type === "tool-readDocument") {
                            const names =
                              part.state === "input-available" || part.state === "output-available"
                                ? part.input?.names?.join(", ")
                                : undefined;
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel={names ? `Reading docs: ${names}…` : "Reading docs…"}
                                doneLabel="Read docs"
                                errorLabel="Couldn’t read docs"
                                transient
                              />
                            );
                          }
                          if (part.type === "tool-readSharedEnvSet") {
                            const ids =
                              part.state === "input-available" || part.state === "output-available"
                                ? part.input?.ids?.join(", ")
                                : undefined;
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel={ids ? `Reading env sets: ${ids}…` : "Reading env sets…"}
                                doneLabel="Read env sets"
                                errorLabel="Couldn’t read env sets"
                                transient
                              />
                            );
                          }
                          if (part.type === "tool-searchSkills") {
                            const query =
                              part.state === "input-available" || part.state === "output-available"
                                ? part.input?.query
                                : undefined;
                            const count =
                              part.state === "output-available" ? part.output?.results?.length : undefined;
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel={
                                  query ? `Searching skills for "${query}"…` : "Searching skills…"
                                }
                                doneLabel={
                                  typeof count === "number"
                                    ? `Searched skills (${count} result${count === 1 ? "" : "s"})`
                                    : "Searched skills"
                                }
                                errorLabel="Skill search failed"
                                transient
                              />
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
                    <Message align="start">
                      <MessageContent>
                        <Marker className="normal-case tracking-normal font-normal">
                          <MarkerIcon>
                            <LoaderCircle className="animate-spin" />
                          </MarkerIcon>
                          <MarkerContent className="normal-case tracking-normal">
                            Thinking…
                          </MarkerContent>
                        </Marker>
                      </MessageContent>
                    </Message>
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
