import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
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
import { useTRPC } from "@/router";
import { PhaseBadge } from "@/client/ui/components/phase-badge";
import { Button } from "@kubeclaw/components/ui/button";
import { EditInstanceDialog } from "@/client/ui/components/edit-agent-dialog";
import { CopyButton } from "@/client/ui/components/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@kubeclaw/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kubeclaw/components/ui/dropdown-menu";

export const Route = createFileRoute("/agents/$id")({
  component: InstanceDetailPage,
});

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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: instance, isPending, error } = useQuery(trpc.instance.get.queryOptions({ id }));
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const invalidateDetail = () =>
    queryClient.invalidateQueries({ queryKey: trpc.instance.get.queryKey({ id }) });

  const { mutate: suspendInstance } = useMutation(
    trpc.instance.suspend.mutationOptions({ onSuccess: () => setTimeout(invalidateDetail, 500) })
  );
  const { mutate: resumeInstance } = useMutation(
    trpc.instance.resume.mutationOptions({ onSuccess: () => setTimeout(invalidateDetail, 500) })
  );
  const { mutate: deleteInstance, isPending: isDeleting } = useMutation(
    trpc.instance.delete.mutationOptions({
      onSuccess: () => navigate({ to: "/agents/" }),
    })
  );

  if (isPending) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-500">Error: {error.message}</div>;
  if (!instance) return <div className="p-6">Not found</div>;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{instance.agentName ?? instance.id}</h1>
            <PhaseBadge phase={instance.phase} />
          </div>
          <div className="group flex items-center gap-1">
            <p className="text-sm text-muted-foreground font-mono">{instance.id}</p>
            <CopyButton text={instance.id} className="opacity-0 group-hover:opacity-100" />
          </div>
          {instance.agentDescription && (
            <p className="text-sm text-muted-foreground mt-1">{instance.agentDescription}</p>
          )}
        </div>
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Open actions menu" />}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {instance.suspended ? (
                <DropdownMenuItem onClick={() => resumeInstance({ id })}>Resume</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => suspendInstance({ id })}>Pause</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </div>
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
                <CardTitle className="text-sm font-medium">Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion>
                  <AccordionItem value="openclaw-json">
                    <AccordionTrigger className="font-mono text-xs">openclaw.json</AccordionTrigger>
                    <AccordionContent>
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
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
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

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!open) setDeleteOpen(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this agent? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => deleteInstance({ id })}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditInstanceDialog instance={instance} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}
