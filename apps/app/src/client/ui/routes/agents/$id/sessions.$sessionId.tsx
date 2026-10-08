import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { Button } from "@hermeum/components/ui/button";
import { Separator } from "@hermeum/components/ui/separator";
import { Skeleton } from "@hermeum/components/ui/skeleton";

import { useTRPC } from "@/router";
import { SessionTranscript } from "./-components/session-transcript";

export const Route = createFileRoute("/agents/$id/sessions/$sessionId")({
  component: SessionPage,
});

function SessionPage() {
  const { id, sessionId } = Route.useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
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

      {/* Chat history */}
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
        <SessionTranscript
          events={session.events}
          agentLabel={agent?.name ?? agent?.id ?? "Agent"}
        />
      )}
    </div>
  );
}