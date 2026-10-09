import { ChevronLeft, ChevronRight } from "lucide-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";

import { Button } from "@hermeum/components/ui/button";
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

// Page size is owned by the UI and sent explicitly as `limit`; the server
// applies no default of its own.
const PAGE_SIZE = 20;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function SessionsTab({ agentId, page }: { agentId: string; page: number }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { data, isPending, isPlaceholderData, error } = useQuery({
    ...trpc.agentSession.list.queryOptions({
      agentId,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    // Page changes swap params, not keys' semantics — keep the previous page's
    // rows rendered while the next page streams in instead of flashing empty.
    placeholderData: keepPreviousData,
  });

  const setPage = (nextPage: number) =>
    void navigate({
      to: "/agents/$id",
      params: { id: agentId },
      search: (prev) => ({ ...prev, page: nextPage }),
    });

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
  const sessions: AgentSessionSummary[] = data.items;
  if (page === 1 && sessions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">No sessions yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
          {sessions.map((session) => (
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page}
          {isPlaceholderData ? " …" : ""}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            aria-label="Previous page"
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!data.hasMore || isPlaceholderData}
            aria-label="Next page"
            onClick={() => setPage(page + 1)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}