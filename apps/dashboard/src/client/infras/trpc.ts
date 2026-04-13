import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/trpc";
import type { API } from "../usecases/adaptors/api";
import type { Instance } from "@/entities/instance";
import type { Template } from "@/entities/template";

export class TrpcClient implements API {
  private readonly client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: "/trpc" })],
  });

  async listInstances(): Promise<Instance[]> {
    return await this.client.instance.list.query();
  }

  async getInstance(name: string): Promise<Instance | null> {
    return await this.client.instance.get.query({ name });
  }

  async createInstance(templateName: string): Promise<Instance> {
    return await this.client.instance.create.mutate({ templateName });
  }

  async deleteInstance(name: string): Promise<void> {
    return await this.client.instance.delete.mutate({ name });
  }

  async listTemplates(): Promise<Template[]> {
    return await this.client.template.list.query();
  }
}
