import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import CodeMirror from "@uiw/react-codemirror";
import { json as jsonLang } from "@codemirror/lang-json";
import { Badge } from "@kubeclaw/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@kubeclaw/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@kubeclaw/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@kubeclaw/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@kubeclaw/components/ui/table";
import { type InstancePhase } from "@/entities";
import { useTRPC } from "@/router";
import { Button } from "@kubeclaw/components/ui/button";
import { EditInstanceDialog } from "@/client/ui/components/edit-instance-dialog";

export const Route = createFileRoute("/instances/$id")({
  component: InstanceDetailPage,
});

function phaseBadgeClass(phase: InstancePhase | undefined) {
  switch (phase) {
    case "Running":
      return "bg-green-100 text-green-800";
    case "Pending":
    case "Provisioning":
    case "Updating":
    case "Restoring":
    case "BackingUp":
      return "bg-yellow-100 text-yellow-800";
    case "Failed":
    case "Degraded":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

const BADGE_MAX = 10;

function BadgeList({ items, max = BADGE_MAX }: { items: string[]; max?: number }) {
  const visible = items.slice(0, max);
  const overflow = items.length - visible.length;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((item) => (
        <Badge key={item} variant="secondary" className="font-mono text-xs">
          {item}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          +{overflow} more
        </Badge>
      )}
    </div>
  );
}

function InstanceDetailPage() {
  const { id } = Route.useParams();
  const trpc = useTRPC();
  const { data: instance, isPending, error } = useQuery(trpc.instance.get.queryOptions({ id }));
  const [editOpen, setEditOpen] = useState(false);

  if (isPending) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error.message}</div>;
  if (!instance) return <div className="p-6">Not found</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1">
        <Link to="/instances" className="hover:underline">
          Instances
        </Link>
        <span>/</span>
        <span>{instance.agentName ?? instance.id}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{instance.agentName ?? instance.id}</h1>
            {instance.phase && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${phaseBadgeClass(instance.phase)}`}
              >
                {instance.phase}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono">{instance.id}</p>
          {instance.agentDescription && (
            <p className="text-sm text-muted-foreground mt-1">{instance.agentDescription}</p>
          )}
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agent">
        <TabsList>
          <TabsTrigger value="agent">Agent</TabsTrigger>
        </TabsList>

        <TabsContent value="agent" className="mt-4 flex flex-col gap-4">
          {/* openClawJson */}
          {instance.openClawJson && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">openclaw.json</CardTitle>
              </CardHeader>
              <CardContent>
                <CodeMirror
                  value={JSON.stringify(instance.openClawJson, null, 2)}
                  extensions={[jsonLang()]}
                  editable={false}
                  maxHeight="300px"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    searchKeymap: false,
                    autocompletion: false,
                    lintKeymap: false,
                  }}
                  className="overflow-hidden rounded-lg border text-sm [&_.cm-content]:outline-none [&_.cm-editor.cm-focused]:outline-none"
                />
              </CardContent>
            </Card>
          )}

          {/* workspaceFiles */}
          {instance.workspaceFiles && Object.keys(instance.workspaceFiles).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Workspace Files</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion multiple>
                  {Object.entries(instance.workspaceFiles).map(([filename, content]) => (
                    <AccordionItem key={filename} value={filename}>
                      <AccordionTrigger className="font-mono text-xs">{filename}</AccordionTrigger>
                      <AccordionContent>
                        <pre className="rounded bg-muted p-3 text-xs overflow-auto max-h-64">
                          {content}
                        </pre>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          )}

          {/* envVars */}
          {instance.envVars && instance.envVars.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Environment Variables</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instance.envVars.map((e) => (
                      <TableRow key={e.name}>
                        <TableCell className="font-mono text-xs">{e.name}</TableCell>
                        <TableCell className="font-mono text-xs">{e.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* skills */}
          {instance.skills && instance.skills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <BadgeList items={instance.skills} max={10} />
              </CardContent>
            </Card>
          )}

          {/* plugins */}
          {instance.plugins && instance.plugins.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Plugins</CardTitle>
              </CardHeader>
              <CardContent>
                <BadgeList items={instance.plugins} max={10} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <EditInstanceDialog instance={instance} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
