import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@hermeum/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hermeum/components/ui/table";

import { useTRPC } from "@/router";
import type { AgentSessionSummary } from "@/entities";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SessionsTab({ agentId }: { agentId: string }) {
  const trpc = useTRPC();
  const { data: sessions, isPending, error } = useQuery(
    trpc.agentSession.list.queryOptions({ agentId })
  );

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 pt-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (error) {
    return <p className="pt-4 text-sm text-destructive">Error: {error.message}</p>;
  }
  if (sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No sessions yet.</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Session</TableHead>
          <TableHead>Started</TableHead>
          <TableHead>Last activity</TableHead>
          <TableHead className="text-right">Events</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session: AgentSessionSummary) => (
          <TableRow key={session.sessionId}>
            <TableCell>
              <Link
                to="/agents/$id/sessions/$sessionId"
                params={{ id: agentId, sessionId: session.sessionId }}
                className="font-mono text-sm underline-offset-4 hover:underline"
              >
                {session.sessionId}
              </Link>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatTime(session.firstEventAt)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatTime(session.lastEventAt)}
            </TableCell>
            <TableCell className="text-right text-sm text-muted-foreground">
              {session.eventCount}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}