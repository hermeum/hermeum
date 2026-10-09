import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@hermeum/components/ui/pagination";
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
  const router = useRouter();
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
      // Dropping the page key entirely once back on page one keeps the URL clean.
      search: ({ page: _page, ...rest }) =>
        nextPage > 1 ? { ...rest, page: nextPage } : rest,
    });

  // Prev/next get real hrefs (middle-click works, aria-disabled + classes
  // stand in for the disabled attribute that anchors cannot have); clicking
  // falls through to SPA navigation so no full document reload happens.
  const pageHref = (targetPage: number) =>
    router.buildLocation({
      to: "/agents/$id",
      params: { id: agentId },
      search: { tab: "sessions", ...(targetPage > 1 ? { page: targetPage } : {}) },
    }).href;

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
      <Pagination className="justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={pageHref(page - 1)}
              text="Prev"
              aria-disabled={page <= 1}
              className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (page > 1) setPage(page - 1);
              }}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href={pageHref(page + 1)}
              aria-disabled={!data.hasMore || isPlaceholderData}
              className={!data.hasMore || isPlaceholderData ? "pointer-events-none opacity-50" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (data.hasMore && !isPlaceholderData) setPage(page + 1);
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}