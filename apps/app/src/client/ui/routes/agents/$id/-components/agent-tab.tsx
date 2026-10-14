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
  derivePlatformAvailability,
  getPlatformLabel,
  type Agent,
  type AgentCron,
  PlatformId,
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

const ENDPOINT_PLATFORM_IDS = [PlatformId.ApiServer, PlatformId.Webhook, PlatformId.Teams] as const;

const ENDPOINT_LABEL_CLASS = "w-28 shrink-0 text-sm font-medium";

interface EndpointRowData {
  key: string;
  label: string;
  url: string;
  tooltip?: string;
  note?: string;
  muted?: boolean;
}

function EndpointRow({ row }: { row: EndpointRowData }) {
  const urlClass = `min-w-0 break-all font-mono text-xs${
    row.muted ? " text-muted-foreground opacity-60" : ""
  }`;
  return (
    <div className="flex items-start gap-3">
      <span className={`${ENDPOINT_LABEL_CLASS}${row.muted ? " text-muted-foreground opacity-60" : ""}`}>
        {row.label}
      </span>
      <div className="group flex min-w-0 flex-1 items-center gap-1">
        {row.tooltip ? (
          <Tooltip>
            <TooltipTrigger render={<span className={`${urlClass} cursor-help`} />}>
              {row.url}
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-xs">{row.tooltip}</div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={urlClass}>{row.url}</span>
        )}
        <CopyButton text={row.url} className="shrink-0 opacity-0 group-hover:opacity-100" />
        {row.note && <span className="text-xs text-muted-foreground">{row.note}</span>}
      </div>
    </div>
  );
}

// Endpoint path suffixes per HTTP platform (upstream semantics):
// api-server serves the OpenAI-compatible surface at the root, webhook
// routes live at /webhooks/<route-name> (route names become URL paths),
// Teams listens on the fixed /api/messages bot path.
// See docs/official/api-server.md, webhooks.md, teams.md.

function EndpointsSection({ agent }: { agent: Agent }) {
  const webhookRoutes = Object.keys(
    agent.config?.platforms?.webhook?.extra?.routes ?? {},
  ).sort();
  const rows: EndpointRowData[] = [];
  const unavailable: Array<{ label: string; reason: string }> = [];

  for (const id of ENDPOINT_PLATFORM_IDS) {
    const availability = derivePlatformAvailability(id, agent);
    if (availability.status === "unavailable") {
      unavailable.push({
        label: getPlatformLabel(id),
        reason: availability.reason ?? "Unavailable.",
      });
      continue;
    }
    if (availability.endpoint === undefined) continue;
    const label = getPlatformLabel(id);
    if (id === PlatformId.ApiServer) {
      rows.push({
        key: id,
        label,
        url: availability.endpoint,
        tooltip:
          "OpenAI-compatible base URL — point clients at it (e.g. POST /v1/chat/completions, GET /v1/models).",
      });
    } else if (id === PlatformId.Webhook) {
      if (webhookRoutes.length === 0) {
        rows.push({
          key: id,
          label,
          url: availability.endpoint,
          muted: true,
          note: "No routes configured.",
        });
      } else {
        webhookRoutes.forEach((route, i) => {
          rows.push({
            key: `${id}-${route}`,
            label: i === 0 ? label : "",
            url: `${availability.endpoint}/webhooks/${route}`,
          });
        });
      }
    } else if (id === PlatformId.Teams) {
      rows.push({
        key: id,
        label,
        url: `${availability.endpoint}/api/messages`,
      });
    }
  }

  return (
    <div className="py-8 flex flex-col gap-3">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-bold">Endpoints</p>
        <Tooltip>
          <TooltipTrigger
            render={
              <Info className="size-3 text-muted-foreground cursor-help" aria-label="Endpoints info" />
            }
          />
          <TooltipContent>
            <div className="max-w-xs">
              Inbound HTTP endpoints for the platforms Hermeum manages (API
              server, webhook, Teams). Slack and Discord are gateway-relayed
              and have no endpoint.
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No endpoints configured.</p>
      ) : (
        <TooltipProvider>
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <EndpointRow key={row.key} row={row} />
            ))}
            {unavailable.map(({ label, reason }) => (
              <Tooltip key={label}>
                <TooltipTrigger
                  render={
                    <span
                      className={`${ENDPOINT_LABEL_CLASS} cursor-help text-muted-foreground opacity-60`}
                    />
                  }
                >
                  {label}
                </TooltipTrigger>
                <TooltipContent>
                  <span className="capitalize opacity-80">Unavailable — {reason}</span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}

function cronSettings(cron: AgentCron): string[] {
  return [
    ...(cron.workdir !== undefined ? [`workdir: ${cron.workdir}`] : []),
    ...(cron.model !== undefined ? [`model: ${cron.model}`] : []),
    ...(cron.provider !== undefined ? [`provider: ${cron.provider}`] : []),
    ...(cron.reasoningEffort !== undefined ? [`reasoning: ${cron.reasoningEffort}`] : []),
    ...(cron.continuity === true ? ["continuity: on"] : []),
  ];
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
                    {cronSettings(cron).length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Run settings</p>
                        <ButtonList items={cronSettings(cron)} max={10} />
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
      {/* endpoints */}
      <EndpointsSection agent={agent} />

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
        <p className="text-sm font-bold">config.yaml</p>
        {agent.config ? (
          <AgentConfigEditor
            value={stringifyYaml(agent.config, { blockQuote: "literal", lineWidth: 0 }).trim()}
            readOnly
            maxHeight="350px"
            foldable
          />
        ) : (
          <p className="text-sm text-muted-foreground">Not set — use Edit to configure.</p>
        )}
      </div>

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
          <ButtonList
            items={agent.plugins.map((p) => (p.ref ? `${p.identifier} @ ${p.ref.slice(0, 7)}` : p.identifier))}
            max={10}
          />
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