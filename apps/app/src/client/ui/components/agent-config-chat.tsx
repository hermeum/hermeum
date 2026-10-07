import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { UIDataTypes, UIMessage } from "ai";
import { ArrowUp, Check, LoaderCircle, Square } from "lucide-react";

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
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@hermeum/components/ui/questionnaire";
import { Streamdown } from "streamdown";
import type { AgentInput } from "@/entities";
import { AgentInputObjectSchema, AgentPatchSchema, applyAgentPatch, type AgentPatch } from "@/entities";

// Mirrors the server-executed tools declared in ChatUseCase.getAgentConfigContext
// so the UI can render their lifecycle as markers alongside the client tools.
type ReadDocumentOutput = {
  documents: Array<{ name: string; content: string } | { name: string; error: string }>;
};
type ReadSharedEnvSetOutput = {
  sharedEnvSets: Array<{ id: string; envVars: { name: string }[] } | { id: string; error: string }>;
};
type SearchSkillsOutput = { results: { name: string; identifier: string; description: string }[] };

// Client-executed: the user answers every question, then confirms (Submit) or
// declines (Skip) — see ClarifyCard. Answers align with the questions by
// index; `skipped` is sent instead of answers when the user declines.
type ClarifyInput = { questions: { question: string; choices?: string[] }[] };
type ClarifyOutput = { answers: string[]; skipped: boolean };

// Max consecutive failed config-writing tool calls (replaceAgentConfig or
// patchAgentConfig) the model may make in a row before it is told to stop
// retrying and explain the problem instead.
const MAX_CONFIG_UPDATE_FAILURES = 1;

// Max successful config-writing tool calls (replaceAgentConfig or
// patchAgentConfig) per conversation turn. The auto-resubmit loop re-runs
// after every tool call, so without a cap the model can chain unlimited
// "successful" updates, iterating its own mistakes as noisy edit history.
// When exceeded, it is told to stop and explain in text.
const MAX_CONFIG_UPDATE_SUCCESSES = 2;

type AgentConfigChatMessage = UIMessage<
  unknown,
  UIDataTypes,
  {
    // Client-executed (handled in onToolCall or via user-confirmed UI).
    replaceAgentConfig: { input: AgentInput; output: string };
    patchAgentConfig: { input: AgentPatch; output: string };
    readAgentConfig: { input: undefined; output: AgentInput | undefined };
    clarify: { input: ClarifyInput; output: ClarifyOutput };
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
  // Shown in the empty-state hero. Defaults to new-agent copy.
  emptyTitle?: string;
  emptyDescription?: string;
  // Placeholder for the composer when there are no messages yet.
  emptyPlaceholder?: string;
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

// Interactive wizard for a pending `clarify` tool call, built on the shadcn
// Questionnaire component. One question per step; each offers its choices
// (single-select) plus a free-text "Other" input, or only the input when the
// model supplied no choices. The final Submit is the explicit confirmation of
// all collected answers; the host-owned Skip at any point declines the whole
// call — skip-per-question would not fit the `{ answers, skipped }` contract.
function ClarifyCard({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: ClarifyInput["questions"];
  onSubmit: (answers: string[]) => void;
  onSkip: () => void;
}) {
  const items = questions.map((_, index) => ({
    name: `question-${index}`,
    required: true,
    choices: questions[index]!.choices?.map((choice) => ({ value: choice })) ?? [],
  }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(
      questions.map((_, index) => {
        // A question with choices renders radios and the "Other" input under
        // the same field name. Unchecked radios are not submitted, so the
        // entries are the radio value (when a choice was picked) followed by
        // any explicitly typed Other answer. The typed answer wins; otherwise
        // the selected choice; otherwise "" (can't happen — Submit validates
        // required items first).
        const values = new FormData(event.currentTarget)
          .getAll(`question-${index}`)
          .map(String)
          .filter((value) => value.trim().length > 0);
        return values.length > 0 ? values[values.length - 1]!.trim() : "";
      })
    );
  };

  return (
    <Questionnaire items={items} shortcuts="letters" onSubmit={handleSubmit}>
      <QuestionnaireProgress />
      {questions.map(({ question, choices }, index) => (
        <QuestionnaireItem key={index} name={`question-${index}`}>
          <QuestionnaireTitle className="tracking-normal normal-case text-sm font-medium">
            {question}
          </QuestionnaireTitle>
          <QuestionnaireChoices>
            {choices?.map((choice) => (
              <QuestionnaireChoice key={choice} value={choice}>
                <span className="whitespace-normal">{choice}</span>
              </QuestionnaireChoice>
            ))}
            <QuestionnaireInput
              aria-label={choices ? "Other answer" : question}
              placeholder={choices ? "Type another answer…" : "Type your answer…"}
            />
          </QuestionnaireChoices>
          <QuestionnaireError>Choose an answer to continue.</QuestionnaireError>
        </QuestionnaireItem>
      ))}
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <Button type="button" size="sm" variant="outline" onClick={onSkip}>
          Skip
        </Button>
        <QuestionnaireNext />
        <QuestionnaireSubmit>Confirm</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}

export function AgentConfigChat({
  getConfig,
  onConfigUpdate,
  emptyTitle = "What should your agent do?",
  emptyDescription = "Describe your agent or start with a template.",
  emptyPlaceholder = "Describe your agent…",
}: AgentConfigChatProps) {
  const [input, setInput] = useState("");

  // Latest-ref so the onToolCall closure (captured once by the Chat
  // instance) never applies updates through a stale callback. The ref sync
  // runs in an effect so callbacksRef is stable to read inside the closure.
  const callbacksRef = useRef({ getConfig, onConfigUpdate });
  useEffect(() => {
    callbacksRef.current = { getConfig, onConfigUpdate };
  });

  // Config-writing tool call counters (replaceAgentConfig or patchAgentConfig)
  // for the current auto-resubmit loop, reset when the user sends a new
  // message. `successes` caps the chained "successful" updates the model can
  // make per turn (the loop re-runs after every tool call, so without a cap
  // it can iterate its own mistakes as noisy edit history); `failures` caps
  // consecutive validation errors before the model is told to explain the
  // problem in text instead.
  const configUpdateSuccessesRef = useRef(0);
  const configUpdateFailuresRef = useRef(0);

  // Shared apply path for both config-writing tools: validate the final
  // config that will land in the editor, report the outcome to the model,
  // and carry the applied draft in the automatic follow-up request body.
  // Parsed with AgentInputObjectSchema, NOT AgentInputSchema — drafts
  // legitimately carry "<fill-me>" placeholder env values that the user
  // fills in later; the superRefine cross-field rules would reject those.
  function applyConfig(
    toolName: "replaceAgentConfig" | "patchAgentConfig",
    toolCallId: string,
    config: unknown
  ): boolean {
    if (configUpdateSuccessesRef.current >= MAX_CONFIG_UPDATE_SUCCESSES) {
      addToolOutput({
        tool: toolName,
        toolCallId,
        state: "output-error",
        errorText:
          `Update limit reached: the agent config has already been updated ` +
          `${configUpdateSuccessesRef.current} times this turn. Do not call ` +
          "config-writing tools again — summarize the applied state to the " +
          "user in plain text instead.",
      });
      return false;
    }
    const parsed = AgentInputObjectSchema.safeParse(config);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const path = `/${issue.path.join("/")}`;
      const exhausted = configUpdateFailuresRef.current >= MAX_CONFIG_UPDATE_FAILURES;
      configUpdateFailuresRef.current += 1;
      addToolOutput({
        tool: toolName,
        toolCallId,
        state: "output-error",
        errorText: exhausted
          ? `Invalid agent config: ${issue.message} (path: ${path}). ` +
            `Failed to update the agent config after ${MAX_CONFIG_UPDATE_FAILURES + 1} ` +
            "attempts. Do not call config-writing tools again — explain the " +
            "problem to the user in plain text instead."
          : `Invalid agent config: ${issue.message} (path: ${path})`,
      });
      return false;
    }
    configUpdateFailuresRef.current = 0;
    configUpdateSuccessesRef.current += 1;
    callbacksRef.current.onConfigUpdate(parsed.data);
    addToolOutput({
      tool: toolName,
      toolCallId,
      output: "Applied to the editor.",
      // The automatic follow-up request should also carry the draft it
      // just produced.
      options: { body: { config: parsed.data } },
    });
    return true;
  }

  const { messages, sendMessage, stop, status, error, addToolOutput } =
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
        if (toolCall.toolName === "replaceAgentConfig") {
          applyConfig("replaceAgentConfig", toolCall.toolCallId, toolCall.input);
          return;
        }
        if (toolCall.toolName !== "patchAgentConfig") return;
        const parsed = AgentPatchSchema.safeParse(toolCall.input);
        if (!parsed.success) {
          const issue = parsed.error.issues[0]!;
          const path = `/${issue.path.join("/")}`;
          const exhausted = configUpdateFailuresRef.current >= MAX_CONFIG_UPDATE_FAILURES;
          configUpdateFailuresRef.current += 1;
          addToolOutput({
            tool: "patchAgentConfig",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: exhausted
              ? `Invalid agent config patch: ${issue.message} (path: ${path}). ` +
                `Failed to update the agent config after ${MAX_CONFIG_UPDATE_FAILURES + 1} ` +
                "attempts. Do not call config-writing tools again — explain the " +
                "problem to the user in plain text instead."
              : `Invalid agent config patch: ${issue.message} (path: ${path})`,
          });
          return;
        }
        applyConfig(
          "patchAgentConfig",
          toolCall.toolCallId,
          applyAgentPatch(callbacksRef.current.getConfig(), parsed.data)
        );
      },
    });

  function handleSend() {
    const text = input.trim();
    if (text.length === 0 || status !== "ready" || pendingClarify) return;
    configUpdateSuccessesRef.current = 0;
    configUpdateFailuresRef.current = 0;
    sendMessage({ text }, { body: { config: callbacksRef.current.getConfig() } });
    setInput("");
  }

  const isBusy = status === "submitted" || status === "streaming";

  // While a clarify call awaits the user's answers the composer is locked:
  // the model's turn can only resume through the clarify card's Submit/Skip,
  // so a free-text reply would arrive with a missing tool result.
  const pendingClarify = messages.some((message) =>
    message.parts.some(
      (part) =>
        part.type === "tool-clarify" &&
        (part.state === "input-streaming" || part.state === "input-available")
    )
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold tracking-tight">{emptyTitle}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
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
                                <BubbleContent>
                                  <Streamdown
                                    isAnimating={!isUser && status === "streaming"}
                                    {...(isUser ? { mode: "static" as const } : {})}
                                  >
                                    {part.text}
                                  </Streamdown>
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
                          if (part.type === "tool-replaceAgentConfig") {
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel="Replacing the config…"
                                doneLabel="Config replaced"
                                errorLabel="Couldn’t replace the config"
                              />
                            );
                          }
                          if (part.type === "tool-patchAgentConfig") {
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel="Patching the config…"
                                doneLabel="Config patched"
                                errorLabel="Couldn’t patch the config"
                              />
                            );
                          }
                          if (part.type === "tool-clarify") {
                            // The card mounts only on complete input: during
                            // input-streaming the questions array may still be
                            // partial, and the questionnaire's items/names
                            // must not initialize against it.
                            if (part.state === "input-available") {
                              return (
                                <ClarifyCard
                                  key={index}
                                  questions={part.input.questions.map((partial) => ({
                                    question: partial.question,
                                    ...(partial.choices !== undefined ? { choices: partial.choices } : {}),
                                  }))}
                                  onSubmit={(answers) =>
                                    addToolOutput({
                                      tool: "clarify",
                                      toolCallId: part.toolCallId,
                                      output: { answers, skipped: false },
                                    })
                                  }
                                  onSkip={() =>
                                    addToolOutput({
                                      tool: "clarify",
                                      toolCallId: part.toolCallId,
                                      output: { answers: [], skipped: true },
                                    })
                                  }
                                />
                              );
                            }
                            if (part.state === "output-available" && part.output) {
                              const { answers, skipped } = part.output;
                              // Persistent record of the confirmed answers.
                              // A single marker line gets unreadable (and can
                              // overflow) once questions or answers are long.
                              return (
                                <div
                                  key={index}
                                  className="flex flex-col gap-2 rounded-[0.25rem] border bg-muted/40 p-3 text-sm"
                                >
                                  {skipped ? (
                                    <p className="text-muted-foreground">Clarification skipped</p>
                                  ) : (
                                    (part.input?.questions ?? []).map((partial, questionIndex) => (
                                      <div key={questionIndex} className="flex flex-col">
                                        <span className="text-xs text-muted-foreground">
                                          {partial?.question}
                                        </span>
                                        <span className="whitespace-pre-wrap break-words">
                                          {answers[questionIndex]}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              );
                            }
                            return (
                              <ToolMarker
                                key={index}
                                state={part.state}
                                runningLabel="Preparing questions…"
                                doneLabel="Clarified"
                                errorLabel="Clarification failed"
                                transient
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
          disabled={pendingClarify}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            pendingClarify
              ? "Answer the questions above to continue…"
              : messages.length === 0
                ? emptyPlaceholder
                : "Reply…"
          }
          className="min-h-16 border-transparent px-0 py-0 focus-visible:border-transparent"
        />
        <div className="flex justify-end">
          {isBusy ? (
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Stop generating"
              onClick={() => void stop()}
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              aria-label="Send message"
              onClick={handleSend}
              disabled={input.trim().length === 0 || pendingClarify}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
