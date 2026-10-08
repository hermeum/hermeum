import { useEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDownIcon, CircleAlert, LoaderCircle, Plug } from "lucide-react";

import { Button } from "@hermeum/components/ui/button";
import { Bubble, BubbleContent } from "@hermeum/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@hermeum/components/ui/marker";
import {
  MessageScroller,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@hermeum/components/ui/message-scroller";
import { Streamdown } from "streamdown";

import type { AgentSessionEvent } from "@/entities";

// One display item reduced from the event stream. Messages (user + assistant
// text) render as bubbles; tool/error/lifecycle events render as compact
// marker rows. Keyed for the virtualizer's stable identity + measurement.
type TranscriptItem =
  | { kind: "user"; key: string; at: string; text: string }
  | {
      kind: "assistant";
      key: string;
      at: string;
      content: string;
      reasoning: string | null;
      durationS: number | undefined;
    }
  | {
      kind: "tool";
      key: string;
      at: string;
      toolName: string;
      status: "ok" | "error" | "blocked" | "cancelled" | undefined;
      durationS: number | undefined;
    }
  | { kind: "error"; key: string; at: string; stage: "llm" | "tool"; message: string }
  | { kind: "lifecycle"; key: string; at: string; label: string };

// Reduce the ordered event stream into display items. `llm_call` carries the
// user's turn-opening message on the same event as the assistant reply, so it
// fans out into at most two items. `session_started`/`session_finalized` render
// as thin lifecycle lines; subagent lifecycle events are skipped — their
// transcripts live in their own child sessions.
function buildTranscriptItems(events: AgentSessionEvent[]): TranscriptItem[] {
  const items: TranscriptItem[] = [];
  for (const event of events) {
    if (event.type === "llm_call") {
      if (event.userMessage !== undefined) {
        items.push({
          kind: "user",
          key: `${event.eventId}:user`,
          at: event.timestamp,
          text: event.userMessage,
        });
      }
      if (event.assistant.content !== null) {
        items.push({
          kind: "assistant",
          key: `${event.eventId}:assistant`,
          at: event.timestamp,
          content: event.assistant.content,
          reasoning: event.assistant.reasoning ?? null,
          durationS: event.durationS,
        });
      }
    } else if (event.type === "tool_call") {
      items.push({
        kind: "tool",
        key: event.eventId,
        at: event.timestamp,
        toolName: event.toolName,
        status: event.status,
        durationS: event.durationS,
      });
    } else if (event.type === "error") {
      items.push({
        kind: "error",
        key: event.eventId,
        at: event.timestamp,
        stage: event.stage,
        message: event.message,
      });
    } else if (event.type === "session_started") {
      items.push({
        kind: "lifecycle",
        key: event.eventId,
        at: event.timestamp,
        label: `Session started · ${event.provider}/${event.model}`,
      });
    } else if (event.type === "session_finalized") {
      items.push({
        kind: "lifecycle",
        key: event.eventId,
        at: event.timestamp,
        label: "Session finalized",
      });
    }
  }
  return items;
}

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function TranscriptTime({ at }: { at: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {TIME_FORMAT.format(new Date(at))}
    </span>
  );
}

// Role label above each bubble — small tinted pill matching the "base-sera"
// badge look: tint background per role, uppercase micro text.
function MessageLine({
  label,
  at,
  tone,
}: {
  label: string;
  at: string;
  tone: "user" | "agent";
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          tone === "user"
            ? "inline-flex items-center rounded-[0.25rem] bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-800 dark:bg-pink-950 dark:text-pink-300"
            : "inline-flex items-center rounded-[0.25rem] bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300"
        }
      >
        {label}
      </span>
      <TranscriptTime at={at} />
    </div>
  );
}

function ToolStatusIcon({ status }: { status: "ok" | "error" | "blocked" | "cancelled" | undefined }) {
  if (status === undefined || status === "ok") {
    return <Plug />;
  }
  if (status === "error" || status === "blocked") {
    return <CircleAlert className="text-destructive" />;
  }
  return <LoaderCircle className="animate-spin" />;
}

const COLLAPSED_MAX_HEIGHT_PX = 192;

// "Show more" behavior for long bubble content: clamped with a bottom fade
// while collapsed, expanded in full when toggled. Overflow is measured on the
// clamped element so a "Show more" button only appears when the content
// actually exceeds the cap (state lives per-rendered-row; the virtualizer
// remeasures the row on toggle).
function CollapsibleContent({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el.firstElementChild ?? el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={scrollerRef}
        className="relative overflow-hidden"
        style={expanded ? undefined : { maxHeight: COLLAPSED_MAX_HEIGHT_PX }}
        data-collapsed={!expanded && overflows}
      >
        {children}
        {!expanded && overflows && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-fit cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </>
  );
}

function TranscriptRow({
  item,
  agentLabel,
}: {
  item: TranscriptItem;
  agentLabel: string;
}) {
  if (item.kind === "user") {
    return (
      <div className="flex flex-col gap-1">
        <MessageLine label="User" at={item.at} tone="user" />
        <Bubble variant="muted" align="start">
          <BubbleContent>
            <CollapsibleContent>
              <Streamdown mode="static">{item.text}</Streamdown>
            </CollapsibleContent>
          </BubbleContent>
        </Bubble>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="flex flex-col gap-1">
        <MessageLine label={agentLabel} at={item.at} tone="agent" />
        <Bubble variant="outline" align="start">
          <BubbleContent>
            {item.reasoning !== null && (
              <p className="text-xs text-muted-foreground">
                Thought
                {item.durationS !== undefined && ` for ${item.durationS.toFixed(1)}s`}
              </p>
            )}
            <CollapsibleContent>
              <Streamdown>{item.content}</Streamdown>
            </CollapsibleContent>
          </BubbleContent>
        </Bubble>
      </div>
    );
  }
  if (item.kind === "tool") {
    const duration =
      item.durationS !== undefined ? ` · ${item.durationS.toFixed(1)}s` : "";
    return (
      <Marker className="normal-case tracking-normal font-normal">
        <MarkerIcon>
          <ToolStatusIcon status={item.status} />
        </MarkerIcon>
        <MarkerContent>
          {item.toolName}
          {duration}
        </MarkerContent>
      </Marker>
    );
  }
  if (item.kind === "error") {
    return (
      <Marker className="normal-case tracking-normal font-normal">
        <MarkerIcon>
          <CircleAlert className="text-destructive" />
        </MarkerIcon>
        <MarkerContent>
          {item.stage} error: {item.message}
        </MarkerContent>
      </Marker>
    );
  }
  return (
    <Marker variant="separator" className="normal-case tracking-normal">
      <MarkerContent>{item.label}</MarkerContent>
    </Marker>
  );
}

// Bubbles vary widely with content length; markers are near-uniform. These
// estimates only feed the initial layout — the virtualizer measures rendered
// rows dynamically and corrects.
function estimateItemSize(item: TranscriptItem): number {
  switch (item.kind) {
    case "user":
    case "assistant":
      return 140;
    case "tool":
    case "error":
      return 32;
    case "lifecycle":
      return 24;
  }
}

// Scroll-to-end affordance for the virtualized transcript. The MessageScroller
// primitive's button tracks item visibility, which virtualization strips (only
// a window of items is mounted), so this watches the viewport's scroll offset
// directly: visible when scrolled away from the bottom, and
// scrollToIndex(last) on click with dynamic measurement in mind.
function ScrollToEndButton({
  scrollRef,
  onScrollToEnd,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScrollToEnd: () => void;
}) {
  const [awayFromEnd, setAwayFromEnd] = useState(false);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const update = () => {
      setAwayFromEnd(
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 24
      );
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollRef]);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label="Scroll to end"
      className={`absolute bottom-4 left-1/2 -translate-x-1/2 transition-[translate,scale,opacity] duration-200 ${
        awayFromEnd ? "opacity-100" : "pointer-events-none scale-95 opacity-0"
      }`}
      onClick={onScrollToEnd}
    >
      <ArrowDownIcon />
    </Button>
  );
}

export function SessionTranscript({
  events,
  agentLabel,
}: {
  events: AgentSessionEvent[];
  agentLabel: string;
}) {
  const items = buildTranscriptItems(events);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateItemSize(items[index]!),
    overscan: 8,
  });

  const scrollToEnd = () => {
    virtualizer.scrollToIndex(items.length - 1, { align: "end" });
  };

  return (
    <MessageScrollerProvider>
      <MessageScroller className="relative min-h-0 flex-1">
        <MessageScrollerViewport ref={scrollRef}>
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index]!;
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute inset-x-0 pb-8"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TranscriptRow item={item} agentLabel={agentLabel} />
                </div>
              );
            })}
          </div>
        </MessageScrollerViewport>
        <ScrollToEndButton scrollRef={scrollRef} onScrollToEnd={scrollToEnd} />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}