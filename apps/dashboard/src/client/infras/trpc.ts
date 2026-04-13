import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/trpc";
import type { API } from "../usecases/adaptors/api";
import type { Instance } from "@/entities/instance";
import type { Template } from "@/entities/template";

export class TrpcClient implements API {
  private readonly client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "/trpc" })],
  });

  listInstances(): Promise<Instance[]> {
    return this.client.instance.list.query();
  }

  getInstance(name: string): Promise<Instance | null> {
    return this.client.instance.get.query({ name });
  }

  createInstance(templateName: string): Promise<Instance> {
    return this.client.instance.create.mutate({ templateName });
  }

  deleteInstance(name: string): Promise<void> {
    return this.client.instance.delete.mutate({ name });
  }

  listTemplates(): Promise<Template[]> {
    return this.client.template.list.query();
  }
}
