import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, LoaderCircle, Plus } from "lucide-react";

import { Button } from "@hermeum/components/ui/button";
import { Input } from "@hermeum/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@hermeum/components/ui/popover";
import { useTRPC } from "@/router";
import type { AgentInput } from "@/entities";

const MAX_SKILLS = 20;

// Max height of the scrollable item list inside a picker popover.
const LIST_MAX_H = "max-h-64 overflow-y-auto";

// Debounce window for the skills search input, so typing a keyword doesn't
// fire a request per keystroke.
const SEARCH_DEBOUNCE_MS = 300;

// Popover listing the configured agent types (key + description).
// Single-select: picking a type replaces the current one; picking the
// selected type again clears it. Returns the picked key via `onChange`
// (undefined = cleared).
function AgentTypePicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (key: string | undefined) => void;
}) {
  const trpc = useTRPC();
  const { data: agentTypes = [] } = useQuery(trpc.agentType.list.queryOptions());

  const selected = agentTypes.find((t) => t.key === value);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Type
      </span>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="xs"
              className="h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal"
            />
          }
        >
          {selected ? selected.key : <span className="text-muted-foreground">None</span>}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-fit min-w-48 p-1">
          {agentTypes.length === 0 ? (
            <p className="px-2 py-1.5 text-xs opacity-80">No agent types configured.</p>
          ) : (
            <div className={`flex flex-col gap-0.5 ${LIST_MAX_H}`}>
            {agentTypes.map((t) => (
              <button
                key={t.key}
                type="button"
                className="flex w-full items-start gap-2 rounded-none px-2 py-1.5 text-left text-xs hover:bg-background/20"
                onClick={() => onChange(value === t.key ? undefined : t.key)}
              >
                <Check
                  className={`mt-0.5 size-3 shrink-0 ${value === t.key ? "" : "invisible"}`}
                />
                <span className="min-w-0">
                  <span className="font-mono">{t.key}</span>
                  {t.description && (
                    <span className="block opacity-80">{t.description}</span>
                  )}
                </span>
              </button>
            ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Keyword-search multi-select popover over the curated Hermes skills index.
// Searches server-side on typed keywords (debounced) rather than listing the
// whole index at open; an empty query shows the featured list. Selections
// made from earlier searches stay selected via checkmarks.
function SkillsPicker({
  value,
  onChange,
}: {
  value: string[] | undefined;
  onChange: (skills: string[] | undefined) => void;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  // Debounce the raw input into the actual search keyword.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input]);

  // Search only while the picker is open — no requests at initialization, and
  // reopening refetches against the live index. keepPreviousData keeps the
  // last result set rendered (checkmarks stable) while a new query streams in.
  const { data: skills = [], isFetching } = useQuery(
    trpc.skill.search.queryOptions(
      { query },
      { enabled: open, placeholderData: keepPreviousData }
    )
  );

  const selected = value ?? [];

  function toggle(identifier: string) {
    if (selected.includes(identifier)) {
      const next = selected.filter((s) => s !== identifier);
      onChange(next.length > 0 ? next : undefined);
    } else if (selected.length < MAX_SKILLS) {
      onChange([...selected, identifier]);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setInput("");
      setQuery("");
    }
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Skills
      </span>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              size="xs"
              className="h-auto px-2 py-1 text-xs normal-case tracking-normal"
            />
          }
        >
          <Plus />
          {selected.length > 0 ? `Skills (${selected.length})` : "Add skill"}
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 flex-col p-1">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search skills by keyword…"
            className="h-7 px-2 border-b-foreground/30 text-xs placeholder:opacity-70"
          />
          <div className="relative mt-1 max-h-64 overflow-y-auto">
            <div className="flex flex-col gap-0.5">
              {!isFetching && skills.length === 0 ? (
                <p className="px-2 py-1.5 text-xs opacity-80">
                  {query === "" ? "Skill index unavailable." : "No matching skills."}
                </p>
              ) : (
                skills.map((s) => (
                  <button
                    key={s.identifier}
                    type="button"
                    className="flex w-full items-start gap-2 rounded-none py-1.5 text-left text-xs hover:bg-background/20"
                    title={s.identifier}
                    onClick={() => toggle(s.identifier)}
                  >
                    <Check
                      className={`mt-0.5 size-3 shrink-0 ${
                        selected.includes(s.identifier) ? "" : "invisible"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1">
                        <span className="font-mono">{s.name}</span>
                        {s.sourceUrl && (
                          <a
                            href={s.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View source"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              window.open(s.sourceUrl, "_blank", "noopener,noreferrer");
                            }}
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </span>
                      {s.description && (
                        <span className="block opacity-80">{s.description}</span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
            {isFetching && (
              <div className="flex justify-center py-2">
                <LoaderCircle className="size-3 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Bar rendered above the agent config editor. Edits the draft's user-managed
// fields (`type`, `skills`) directly; the YAML editor and chat stay in sync
// through the same `onChange` path as hand edits.
export function AgentPickerBar({
  config,
  onChange,
}: {
  config: AgentInput | undefined;
  onChange: (patch: { type?: string | undefined; skills?: string[] | undefined }) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      <AgentTypePicker value={config?.type} onChange={(type) => onChange({ type })} />
      <SkillsPicker value={config?.skills} onChange={(skills) => onChange({ skills })} />
    </div>
  );
}