import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";

import { Badge } from "@hermeum/components/ui/badge";
import { Button } from "@hermeum/components/ui/button";
import { Input } from "@hermeum/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@hermeum/components/ui/popover";
import { ScrollArea } from "@hermeum/components/ui/scroll-area";
import { useTRPC } from "@/router";
import type { AgentInput } from "@/entities";

const MAX_SKILLS = 20;

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
        <PopoverContent align="start" className="flex flex-col gap-0.5 p-1">
          {agentTypes.length === 0 ? (
            <p className="px-2 py-1.5 text-xs opacity-80">No agent types configured.</p>
          ) : (
            agentTypes.map((t) => (
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
            ))
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Searchable multi-select popover over the curated Hermes skills index.
// Selected skills are also rendered as dismissible badges next to the trigger.
function SkillsPicker({
  value,
  onChange,
}: {
  value: string[] | undefined;
  onChange: (skills: string[] | undefined) => void;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: skills = [] } = useQuery(trpc.skill.list.queryOptions());

  const selected = value ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q === "") return skills;
    return skills.filter((s) =>
      [s.name, s.identifier, s.description].some((field) => field.toLowerCase().includes(q))
    );
  }, [skills, search]);

  function toggle(identifier: string) {
    if (selected.includes(identifier)) {
      const next = selected.filter((s) => s !== identifier);
      onChange(next.length > 0 ? next : undefined);
    } else if (selected.length < MAX_SKILLS) {
      onChange([...selected, identifier]);
    }
  }

  function remove(identifier: string) {
    const next = selected.filter((s) => s !== identifier);
    onChange(next.length > 0 ? next : undefined);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        Skills
      </span>
      <Popover open={open} onOpenChange={setOpen}>
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
          Add skill
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-80 flex-col gap-1 p-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="h-7 border-b-foreground/30 text-xs placeholder:opacity-70"
          />
          <ScrollArea className="max-h-64">
            <div className="flex flex-col gap-0.5">
              {filtered.length === 0 ? (
                <p className="px-2 py-1.5 text-xs opacity-80">
                  {skills.length === 0 ? "Skill index unavailable." : "No matching skills."}
                </p>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.identifier}
                    type="button"
                    className="flex w-full items-start gap-2 rounded-none px-2 py-1.5 text-left text-xs hover:bg-background/20"
                    title={s.identifier}
                    onClick={() => toggle(s.identifier)}
                  >
                    <Check
                      className={`mt-0.5 size-3 shrink-0 ${
                        selected.includes(s.identifier) ? "" : "invisible"
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="font-mono">{s.name}</span>
                      {s.description && (
                        <span className="block opacity-80">{s.description}</span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {selected.map((identifier) => (
        <Badge
          key={identifier}
          render={
            <button
              type="button"
              aria-label={`Remove skill ${identifier}`}
              onClick={() => remove(identifier)}
              className="cursor-pointer font-mono"
            />
          }
          className="max-w-48 gap-0.5 truncate font-mono text-[0.6875rem] normal-case tracking-normal"
        >
          <span className="truncate">{identifier}</span>
          <X />
        </Badge>
      ))}
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