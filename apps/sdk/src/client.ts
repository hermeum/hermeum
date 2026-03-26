import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@kubebox/trpc/client";
import type { AgentSandbox, CreateSandboxInput, ListSandboxesInput } from "@kubebox/entities";

export interface KubeBoxClientOptions {
  /** Base URL of the KubeBox server. E.g. http://localhost:3000 */
  baseUrl: string;
  /** Default namespace for all operations */
  namespace?: string;
  /** Optional auth token */
  token?: string;
}

export class KubeBoxClient {
  private readonly trpc: ReturnType<typeof createTRPCClient<AppRouter>>;
  readonly namespace: string;

  constructor(private readonly opts: KubeBoxClientOptions) {
    this.namespace = opts.namespace ?? "default";
    this.trpc = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${opts.baseUrl}/trpc`,
          ...(opts.token && {
            headers: { Authorization: `Bearer ${opts.token}` },
          }),
        }),
      ],
    });
  }

  // ─── Sandboxes ─────────────────────────────────────────────────────────────

  sandboxes = {
    list: (input?: ListSandboxesInput): Promise<AgentSandbox[]> =>
      this.trpc.sandbox.list.query(input),

    get: (name: string, namespace?: string): Promise<AgentSandbox> =>
      this.trpc.sandbox.get.query({ name, namespace: namespace ?? this.namespace }),

    create: (input: CreateSandboxInput): Promise<AgentSandbox> =>
      this.trpc.sandbox.create.mutate(input),

    delete: (name: string, namespace?: string): Promise<{ deleted: boolean }> =>
      this.trpc.sandbox.delete.mutate({ name, namespace: namespace ?? this.namespace }),

    logs: (
      name: string,
      opts?: { namespace?: string; tail?: number }
    ): Promise<{ lines: string[] }> =>
      this.trpc.sandbox.logs.query({
        name,
        namespace: opts?.namespace ?? this.namespace,
        tail: opts?.tail ?? 100,
      }),
  };
}
