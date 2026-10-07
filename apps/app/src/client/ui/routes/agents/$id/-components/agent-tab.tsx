import { useQueries } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { stringify as stringifyYaml } from "yaml";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@hermeum/components/ui/accordion";
import { Button } from "@hermeum/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@hermeum/components/ui/tooltip";

import { useTRPC } from "@/router";
import {
  TOOLSET_IDS,
  PLATFORM_IDS,
  deriveToolsetAvailability,
  derivePlatformAvailability,
  getToolsetDescription,
  getToolsetLabel,
  getPlatformDescription,
  getPlatformLabel,
  type Agent,
  type ToolsetId,
  type PlatformId,
} from "@/entities";
import { AgentConfigEditor } from "@/client/ui/components/agent-config-editor";
import { CopyButton } from "@/client/ui/components/copy-button";

const BADGE_MAX = 10;

function ButtonList({ items, max = BADGE_MAX }: { items: string[]; max?: number }) {
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((item) => (
        <Button
          key={item}
          variant="outline"
          size="sm"
          className="h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal"
        >
          {item}
        </Button>
      ))}
      {overflow > 0 && <span className="text-xs text-muted-foreground">+{overflow} more</span>}
    </div>
  );
}

function ToolsetBadge({ id, agent }: { id: ToolsetId; agent: Agent }) {
  const { status, reason } = deriveToolsetAvailability(id, agent);
  const label = getToolsetLabel(id);
  const description = getToolsetDescription(id);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={`h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal ${
              status === "unavailable" ? "text-muted-foreground opacity-60" : ""
            }`}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          <span>{description}</span>
          {reason && (
            <span className="capitalize opacity-80">
              {status} — {reason}
            </span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function ToolsetsSection({ agent }: { agent: Agent }) {
  return (
    <div className="py-8 flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold">Toolsets</p>
        <Tooltip>
          <TooltipTrigger
            render={
              <Info className="size-3 text-muted-foreground cursor-help" aria-label="Toolsets info" />
            }
          />
          <TooltipContent>
            <div className="max-w-xs">
              Hermes&apos; 25 built-in toolsets. Plugin toolsets are not listed.
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
      <TooltipProvider>
        <div className="flex flex-wrap gap-2">
          {TOOLSET_IDS.map((id) => (
            <ToolsetBadge key={id} id={id} agent={agent} />
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

function PlatformBadge({ id, agent }: { id: PlatformId; agent: Agent }) {
  const { status, reason, home, endpoint } = derivePlatformAvailability(id, agent);
  const label = getPlatformLabel(id);
  const description = getPlatformDescription(id);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={`h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal ${
              status === "unavailable" ? "text-muted-foreground opacity-60" : ""
            }`}
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="flex flex-col gap-0.5">
          <span>{description}</span>
          {endpoint !== undefined && (
            <div className="group flex min-w-0 items-center gap-1">
              <span className="min-w-0 break-all font-mono">{endpoint}</span>
              <CopyButton
                text={endpoint}
                className="shrink-0 opacity-0 group-hover:opacity-100"
              />
            </div>
          )}
          {home !== undefined && <span>Home channel: {home}</span>}
          {reason && (
            <span className="capitalize opacity-80">
              {status} — {reason}
            </span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CronsSection({ agent }: { agent: Agent }) {
  const crons = agent.crons ?? [];
  return (
    <div className="py-8 flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold">Crons</p>
        <Tooltip>
          <TooltipTrigger
            render={
              <Info className="size-3 text-muted-foreground cursor-help" aria-label="Crons info" />
            }
          />
          <TooltipContent>
            <div className="max-w-xs">
              Scheduled jobs that trigger this agent on a timer.
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
      {crons.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cron jobs configured.</p>
      ) : (
        <TooltipProvider>
          <Accordion multiple className="w-full border rounded-md px-4">
            {crons.map((cron) => (
              <AccordionItem key={cron.name} value={cron.name}>
                <AccordionTrigger className="items-center hover:no-underline">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium hover:underline">{cron.name}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal"
                    >
                      {cron.schedule}
                    </Button>
                    {cron.deliver && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal"
                      >
                        → {cron.deliver}
                      </Button>
                    )}
                    {cron.repeat !== undefined && (
                      <span className="text-xs text-muted-foreground">×{cron.repeat}</span>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-3 pb-2">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                      <pre className="rounded bg-muted p-3 text-xs overflow-y-auto max-h-64 whitespace-pre-wrap break-words">
                        {cron.prompt}
                      </pre>
                    </div>
                    {cron.skills && cron.skills.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Skills</p>
                        <ButtonList items={cron.skills} max={10} />
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </TooltipProvider>
      )}
    </div>
  );
}

function PlatformsSection({ agent }: { agent: Agent }) {
  return (
    <div className="py-8 flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold">Message Platforms</p>
        <Tooltip>
          <TooltipTrigger
            render={
              <Info className="size-3 text-muted-foreground cursor-help" aria-label="Message platforms info" />
            }
          />
          <TooltipContent>
            <div className="max-w-xs">
              Only platforms managed by Hermeum are shown here. Other Hermes
              platforms (e.g. Telegram, Discord, WhatsApp) are also available
              and can be wired via the Configuration editor above.
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
      <TooltipProvider>
        <div className="flex flex-wrap gap-2">
          {PLATFORM_IDS.map((id) => (
            <PlatformBadge key={id} id={id} agent={agent} />
          ))}
        </div>
      </TooltipProvider>
    </div>
  );
}

export function AgentTab({ agent }: { agent: Agent }) {
  const trpc = useTRPC();
  const envSetIds = agent.sharedEnvSets ?? [];
  const envSetQueries = useQueries({
    queries: envSetIds.map((setId) => ({
      ...trpc.sharedEnvSet.get.queryOptions({ id: setId }),
      enabled: envSetIds.length > 0,
    })),
  });
  const envSets = envSetQueries
    .map((q) => q.data)
    .filter((s): s is NonNullable<typeof s> => s != null);

  return (
    <div className="flex flex-col divide-y">
      {/* soul */}
      <div className="py-8 flex flex-col gap-3">
        <p className="text-sm font-bold">Soul</p>
        {agent.soul ? (
          <pre className="rounded bg-muted p-3 text-xs overflow-y-auto max-h-64 whitespace-pre-wrap break-words">
            {agent.soul}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">Not set — use Edit to configure.</p>
        )}
      </div>

      {/* config */}
      <div className="py-8 flex flex-col gap-3">
        <p className="text-sm font-bold">Configuration</p>
        {agent.config ? (
          <AgentConfigEditor
            value={stringifyYaml(agent.config, { blockQuote: "literal", lineWidth: 0 }).trim()}
            readOnly
            maxHeight="300px"
            foldable
          />
        ) : (
          <p className="text-sm text-muted-foreground">Not set — use Edit to configure.</p>
        )}
      </div>

      {/* toolsets */}
      <ToolsetsSection agent={agent} />

      {/* message platforms */}
      <PlatformsSection agent={agent} />

      {/* skills */}
      <div className="py-8 flex flex-col gap-3">
        <p className="text-sm font-bold">Skills</p>
        {agent.skills && agent.skills.length > 0 ? (
          <ButtonList items={agent.skills} max={10} />
        ) : (
          <p className="text-sm text-muted-foreground">No skills configured.</p>
        )}
      </div>

      {/* plugins */}
      <div className="py-8 flex flex-col gap-3">
        <p className="text-sm font-bold">Plugins</p>
        {agent.plugins && agent.plugins.length > 0 ? (
          <ButtonList items={agent.plugins} max={10} />
        ) : (
          <p className="text-sm text-muted-foreground">No plugins configured.</p>
        )}
      </div>

      {/* packages */}
      <div className="py-8 flex flex-col gap-3">
        <p className="text-sm font-bold">Packages</p>
        {((agent.packages?.pip?.length ?? 0) > 0 || (agent.packages?.npm?.length ?? 0) > 0) ? (
          <div className="flex flex-col gap-3">
            {agent.packages?.pip && agent.packages.pip.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">Python</p>
                <ButtonList items={agent.packages.pip} max={10} />
              </div>
            )}
            {agent.packages?.npm && agent.packages.npm.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">NPM</p>
                <ButtonList items={agent.packages.npm} max={10} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No packages configured.</p>
        )}
      </div>

      {/* env */}
      <div className="py-8 flex flex-col gap-3">
        <p className="text-sm font-bold">Env Vars</p>
        {agent.env && agent.env.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {agent.env.map((v) => (
              <Button
                key={v.name}
                variant="outline"
                size="sm"
                className="h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal"
              >
                {v.name}={v.value}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No environment variables set.</p>
        )}
      </div>

      {/* crons */}
      <CronsSection agent={agent} />

      {/* shared env sets */}
      <div className="py-8 flex flex-col gap-3">
        <p className="text-sm font-bold">Shared Env Sets</p>
        {agent.sharedEnvSets && agent.sharedEnvSets.length > 0 ? (
          <Accordion multiple className="w-full border rounded-md px-4">
            {envSets?.map((envSet) => (
              <AccordionItem key={envSet.id} value={envSet.id}>
                <AccordionTrigger className="items-center hover:no-underline">
                  <div className="flex items-center gap-2">
                    <span className="font-medium hover:underline">{envSet.name}</span>
                    <div className="group flex items-center gap-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        {envSet.id}
                      </span>
                      <CopyButton
                        text={envSet.id}
                        className="opacity-0 group-hover:opacity-100"
                      />
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {envSet.envVars.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pb-2">
                      {envSet.envVars.map((v) => (
                        <Button
                          key={v.name}
                          variant="outline"
                          size="sm"
                          className="h-auto px-2 py-1 font-mono text-xs normal-case tracking-normal"
                        >
                          {v.name}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground pb-2">
                      No environment variables.
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="text-sm text-muted-foreground">No shared env sets attached.</p>
        )}
      </div>
    </div>
  );
}