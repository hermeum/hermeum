import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { Button } from "@hermeum/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@hermeum/components/ui/resizable";
import { Separator } from "@hermeum/components/ui/separator";
import { Skeleton } from "@hermeum/components/ui/skeleton";

import { useTRPC } from "@/router";
import { SessionTranscript } from "./-components/session-transcript";
import { SessionEventsPanel } from "./-components/session-events-panel";

export const Route = createFileRoute("/agents/$id/sessions/$sessionId")({
  component: SessionPage,
});

function SessionPage() {
  const { id, sessionId } = Route.useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  // Selection shared by both panels (transcript bubble/marker ↔ event row).
  // eventId is the key: llm_call events own both the user and assistant
  // items, so selecting either highlights both in the events list sense.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { data: agent } = useQuery(trpc.agent.get.queryOptions({ id }));
  const {
    data: session,
    isPending,
    error,
  } = useQuery(trpc.agentSession.get.queryOptions({ agentId: id, sessionId }));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      {/* Header: back, title + timestamps, separator as in the design */}
      <div className="shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Back to sessions"
            onClick={() =>
              navigate({ to: "/agents/$id", params: { id }, search: { tab: "sessions" } })
            }
          >
            <ArrowLeft />
          </Button>
          <h1 className="truncate text-2xl font-semibold tracking-tight font-mono">
            {sessionId}
          </h1>
          {agent && <span className="text-muted-foreground">· {agent.name ?? agent.id}</span>}
        </div>
        {session && session.events.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(session.events[0]!.timestamp).toLocaleString()} –{" "}
            {new Date(session.events[session.events.length - 1]!.timestamp).toLocaleString()} ·{" "}
            {session.events.length} events
          </p>
        )}
        <Separator className="mt-4" />
      </div>

      {/* Chat history + events side panel (desktop); transcript only below lg */}
      {isPending ? (
        <div className="flex flex-col gap-3 p-2">
          <Skeleton className="h-16 w-2/3" />
          <Skeleton className="h-24 w-3/4" />
          <Skeleton className="h-16 w-1/2" />
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">Error: {error.message}</div>
      ) : !session || session.events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            {!session ? "Session not found." : "No events recorded."}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:hidden">
          <SessionTranscript
            events={session.events}
            agentLabel={agent?.name ?? agent?.id ?? "Agent"}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
          />
        </div>
      )}
      {!isPending && !error && session && session.events.length > 0 && (
        <div className="hidden min-h-0 flex-1 flex-col lg:flex">
          <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
            {/* Transcript */}
            <ResizablePanel defaultSize="65%" minSize="40%" className="min-h-0">
              <SessionTranscript
                events={session.events}
                agentLabel={agent?.name ?? agent?.id ?? "Agent"}
                selectedEventId={selectedEventId}
                onSelectEvent={setSelectedEventId}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />

            {/* Events panel — desktop only (inline display:flex on the
                resizable internals beats utility classes, so hiding happens
                on this plain wrapper, not on the group/panels) */}
            <ResizablePanel defaultSize="35%" minSize="25%" className="min-h-0">
              <SessionEventsPanel
                events={session.events}
                selectedEventId={selectedEventId}
                onSelectEvent={setSelectedEventId}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}
    </div>
  );
}