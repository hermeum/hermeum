import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CircleAlert, Plug, Sparkles } from "lucide-react";

import { ScrollArea } from "@hermeum/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@hermeum/components/ui/resizable";
import { cn } from "@hermeum/components/lib/utils";

import type { AgentSessionEvent } from "@/entities";
import { CopyButton } from "@/client/ui/components/copy-button";

// Right-hand side panel for the session page: every raw event in timestamp
// order (uniform virtualized rows), with the selected event's full payload in
// a detail pane below.

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

// Short display label per event type, styled after the trajectory viewers:
// `agent.message`, `tool.call`, `error`, `session.started`, …
function eventKind(event: AgentSessionEvent): string {
  switch (event.type) {
    case "llm_call":
      return "agent.message";
    case "tool_call":
      return "tool.call";
    case "error":
      return "error";
    case "session_started":
      return "session.started";
    case "session_finalized":
      return "session.finalized";
    case "subagent_started":
      return "subagent.started";
    case "subagent_stopped":
      return "subagent.stopped";
  }
}

function eventIcon(event: AgentSessionEvent) {
  switch (event.type) {
    case "llm_call":
      return <Sparkles />;
    case "tool_call":
      return <Plug />;
    case "error":
      return <CircleAlert className="text-destructive" />;
    default:
      return null;
  }
}

// One-line preview: the most human-meaningful content of the event.
function eventPreview(event: AgentSessionEvent): string {
  switch (event.type) {
    case "llm_call":
      return (
        event.userMessage ??
        event.assistant.content ??
        (event.assistant.toolCalls.length > 0
          ? `${event.assistant.toolCalls.length} tool call${event.assistant.toolCalls.length === 1 ? "" : "s"}`
          : "—")
      );
    case "tool_call":
      return event.toolName;
    case "error":
      return event.message;
    case "session_started":
      return `${event.provider}/${event.model}`;
    case "session_finalized":
      return event.output.content ?? "—";
    case "subagent_started":
      return event.childSessionId;
    case "subagent_stopped":
      return event.childSessionId;
  }
}

function EventKindLabel({ kind }: { kind: string }) {
  const color =
    kind === "error"
      ? "text-destructive"
      : kind.startsWith("user")
        ? "text-pink-600 dark:text-pink-400"
        : kind.startsWith("session")
          ? "text-muted-foreground/70"
          : "text-blue-600 dark:text-blue-400";
  return <span className={cn("font-mono text-xs", color)}>{kind}</span>;
}

function EventListRow({
  event,
  selected,
  onSelect,
}: {
  event: AgentSessionEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  const kind = eventKind(event);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-selected={selected}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm",
        "data-[selected=true]:bg-muted data-[selected=true]:ring-1 data-[selected=true]:ring-ring/50 in-data-[slot=scroll-area-viewport]:w-full",
        "hover:bg-muted/60"
      )}
    >
      <EventKindLabel kind={kind} />
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {eventPreview(event)}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {TIME_FORMAT.format(new Date(event.timestamp))}
      </span>
    </button>
  );
}

function EventDetail({ event }: { event: AgentSessionEvent }) {
  const serialized = useMemo(() => JSON.stringify(event, null, 2), [event]);
  const kind = eventKind(event);
  const icon = eventIcon(event);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        {icon}
        <span className="text-sm font-medium">
          Event <span className="font-mono">{kind}</span>
        </span>
        <span className="font-mono text-xs text-muted-foreground">{event.eventId}</span>
        <div className="ml-auto flex items-center gap-1">
          <CopyButton text={serialized} className="opacity-60 hover:opacity-100" />
        </div>
      </div>
      <div className="text-xs text-muted-foreground px-3 py-2">
        {new Date(event.timestamp).toLocaleString()}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <pre className="wrap-break-word px-3 pb-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {serialized}
        </pre>
      </ScrollArea>
    </div>
  );
}

export function SessionEventsPanel({ events }: { events: AgentSessionEvent[] }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 30,
    overscan: 10,
    getItemKey: (index) => events[index]!.eventId,
  });

  const selected = selectedIndex !== null ? events[selectedIndex] : undefined;

  return (
    <ResizablePanelGroup orientation="vertical" className="min-h-0">
      {/* Event list */}
      <ResizablePanel defaultSize="55%" minSize="20%" className="min-h-0">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Events
            <span className="font-normal normal-case tracking-normal">{events.length}</span>
          </div>
          <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((row) => (
                <div
                  key={row.key}
                  data-index={row.index}
                  ref={virtualizer.measureElement}
                  className="absolute inset-x-0"
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <EventListRow
                    event={events[row.index]!}
                    selected={row.index === selectedIndex}
                    onSelect={() => setSelectedIndex(row.index)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle />

      {/* Detail pane */}
      <ResizablePanel defaultSize="45%" minSize="20%" className="min-h-0">
        {selected ? (
          <EventDetail event={selected} />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Select an event to see its details.
          </div>
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}