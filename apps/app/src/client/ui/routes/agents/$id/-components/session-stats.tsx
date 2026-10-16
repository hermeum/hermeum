import { Banknote, Clock, Coins, History } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@hermeum/components/ui/tooltip";
import { cn } from "@hermeum/components/lib/utils";

import {
  deriveAgentSessionStatus,
  type AgentSessionEvent,
  type AgentSessionStatus,
} from "@/entities";

// Aggregated client-side from the session's full stored event stream.
// `usage.inputTokens` already includes cached reads/writes, so
// `cacheReadTokens` is a subset of the input count, not an addition to it.
export interface SessionStatsSummary {
  wallClockMs: number | null;
  activeMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number | null;
  totalCostUsd: number | null;
}

// Wall-clock since the session's creation (its first event, of any type) up
// to `now`; null only for a session with no events. Active time sums the
// recorded per-call durations (llm_call + tool_call), skipping events whose
// `durationS` was not measured. Cost is all-or-nothing: a total is produced
// only when every llm_call reports one — like the per-call
// `cost.totalUsd` semantics, measurable parts are never promoted to a total.
export function summarizeSessionStats(
  events: readonly AgentSessionEvent[],
  now: number = Date.now()
): SessionStatsSummary {
  const first = events[0]?.timestamp;
  const wallClockMs = first === undefined ? null : Math.max(0, now - new Date(first).getTime());

  let activeMs = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let hasCacheReadTokens = false;
  let hasLlmCall = false;
  let totalCostUsd = 0;
  let costFullyKnown = true;

  for (const event of events) {
    if (event.type === "llm_call") {
      hasLlmCall = true;
      if (event.durationS !== undefined) activeMs += event.durationS * 1000;
      inputTokens += event.usage.inputTokens;
      outputTokens += event.usage.outputTokens;
      if (event.usage.cacheReadTokens !== undefined) {
        cacheReadTokens += event.usage.cacheReadTokens;
        hasCacheReadTokens = true;
      }
      if (event.cost.totalUsd !== null) totalCostUsd += event.cost.totalUsd;
      else costFullyKnown = false;
    } else if (event.type === "tool_call") {
      if (event.durationS !== undefined) activeMs += event.durationS * 1000;
    }
  }

  return {
    wallClockMs,
    activeMs,
    inputTokens,
    outputTokens,
    cacheReadTokens: hasCacheReadTokens ? cacheReadTokens : null,
    totalCostUsd: hasLlmCall && costFullyKnown ? totalCostUsd : null,
  };
}

// Same derivation the sessions list uses (`deriveAgentSessionStatus` over the
// summary), reconstructed from the detail page's raw events: finalized when
// the latest event is a session_finalized event, then age since the latest
// event decides active vs inactive.
export function deriveAgentSessionStatusFromEvents(
  events: readonly AgentSessionEvent[],
  now: number = Date.now()
): AgentSessionStatus {
  const last = events[events.length - 1];
  if (last === undefined) return "inactive";
  return deriveAgentSessionStatus(last.type === "session_finalized", last.timestamp, now);
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

// Intl.DurationFormat takes a duration object, not a millisecond count, and
// has no fractional-second support — durations floor to whole seconds.
export function splitDurationMs(ms: number): DurationParts {
  let rest = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(rest / 86400);
  rest -= days * 86400;
  const hours = Math.floor(rest / 3600);
  rest -= hours * 3600;
  const minutes = Math.floor(rest / 60);
  return { days, hours, minutes, seconds: rest - minutes * 60 };
}

// Locale pinned to English so values are deterministic and match the session
// list's reference format ("34d 19h", "39.4K"). Intl.DurationFormat is absent
// in Node < 23 (the test/CI runtime) and older browsers, so feature-detect and
// fall back to the hand-rolled narrow formatter in `formatDurationParts`.
const durationFormat = "DurationFormat" in Intl ? new Intl.DurationFormat("en", { style: "narrow" }) : undefined;

// Renders the two most significant units and drops zero-valued ones (the
// native formatter drops them anywhere; the fallback mirrors it so both
// paths produce the same strings — "34d 19h", "2h 3m", "5m", "20s").
export function formatDurationParts({ days, hours, minutes, seconds }: DurationParts): string {
  if (days === 0 && hours === 0 && minutes === 0 && seconds === 0) return "0s";
  if (durationFormat !== undefined) {
    if (days > 0) return durationFormat.format({ days, hours });
    if (hours > 0) return durationFormat.format({ hours, minutes });
    return durationFormat.format({ minutes, seconds });
  }
  const units = [
    [days, "d"] as const,
    [hours, "h"] as const,
    [minutes, "m"] as const,
    [seconds, "s"] as const,
  ];
  if (days > 0) return joinNarrow(units.slice(0, 2));
  if (hours > 0) return joinNarrow(units.slice(1, 3));
  return joinNarrow(units.slice(2, 4));
}

function joinNarrow(units: readonly (readonly [value: number, suffix: string])[]): string {
  return units
    .filter(([value]) => value > 0)
    .map(([value, suffix]) => `${value}${suffix}`)
    .join(" ");
}

export function formatDurationMs(ms: number): string {
  return formatDurationParts(splitDurationMs(ms));
}

const TOKENS_FORMAT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatTokens(tokens: number): string {
  return TOKENS_FORMAT.format(tokens);
}

const USD_FORMAT = new Intl.NumberFormat("en", { style: "currency", currency: "USD" });

export function formatUsd(usd: number): string {
  return USD_FORMAT.format(usd);
}

// Locale pinned to English so values are deterministic, like the formatters
// above. "numeric: auto" yields natural phrasing ("9 days ago") instead of
// "9 days ago." style numeric-only output.
const RELATIVE_FORMAT = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// Coarse age of a timestamp relative to `now`: most significant unit only —
// "9 days ago", "3 hours ago", "25 minutes ago"; "just now" below a minute.
export function formatRelativeAge(iso: string, now: number = Date.now()): string {
  const { days, hours, minutes } = splitDurationMs(Math.max(0, now - new Date(iso).getTime()));
  if (days > 0) return RELATIVE_FORMAT.format(-days, "day");
  if (hours > 0) return RELATIVE_FORMAT.format(-hours, "hour");
  if (minutes > 0) return RELATIVE_FORMAT.format(-minutes, "minute");
  return "just now";
}

// Same rendering as the sessions list's timestamps (toLocaleString) so the
// page header and the list agree on the absolute format.
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

// A header stat chip: icon + value. When `detail` rows are given the value
// gets a hover tooltip rendering them as a two-column breakdown.
function Stat({
  icon: Icon,
  value,
  detail,
  ariaLabel,
}: {
  icon: typeof Clock;
  value: ReactNode;
  detail?: readonly (readonly [label: string, value: ReactNode])[];
  ariaLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={ariaLabel}>
      <Icon className="size-3.5" aria-hidden="true" />
      {detail === undefined ? (
        value
      ) : (
        <Tooltip>
          <TooltipTrigger render={<span className="cursor-help" />}>{value}</TooltipTrigger>
          <TooltipContent>
            <div className="grid grid-cols-[auto_auto] gap-x-4">
              {detail.map(([label, v]) => (
                <Fragment key={label}>
                  <span className="opacity-80">{label}</span>
                  <span className="text-right">{v}</span>
                </Fragment>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

// `now` is the clock the stats are valid as of — the caller passes the
// session query's `dataUpdatedAt`, so wall-clock and status agree with the
// fetched event stream and only move when the data is refetched (the refresh
// button re-stamps it), instead of ticking on every render.
export function SessionStats({
  events,
  now,
  className,
}: {
  events: readonly AgentSessionEvent[];
  now: number;
  className?: string;
}) {
  const stats = summarizeSessionStats(events, now);
  const last = events[events.length - 1];
  if (stats.wallClockMs === null || last === undefined) return null;

  const tokenDetail: (readonly [label: string, value: ReactNode])[] = [
    ["In (incl. cache)", formatTokens(stats.inputTokens)],
    ["Out", formatTokens(stats.outputTokens)],
  ];
  if (stats.cacheReadTokens !== null) {
    tokenDetail.push(["Cache read", formatTokens(stats.cacheReadTokens)]);
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground", className)}>
        <Stat
          icon={Clock}
          ariaLabel="Duration"
          value={formatDurationMs(stats.wallClockMs)}
          detail={[
            ["Wall-clock since created", formatDurationMs(stats.wallClockMs)],
            ["Active (inference + tools)", formatDurationMs(stats.activeMs)],
          ]}
        />
        <Stat
          icon={Coins}
          ariaLabel="Token usage"
          value={
            <>
              In {formatTokens(stats.inputTokens)} · Out {formatTokens(stats.outputTokens)}
            </>
          }
          detail={tokenDetail}
        />
        <Stat
          icon={Banknote}
          ariaLabel="Cost"
          value={stats.totalCostUsd === null ? "Unknown" : formatUsd(stats.totalCostUsd)}
        />
        <Stat
          icon={History}
          ariaLabel="Last activity"
          value={formatRelativeAge(last.timestamp, now)}
          detail={[["Last activity", formatTimestamp(last.timestamp)]]}
        />
      </div>
    </TooltipProvider>
  );
}