import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AgentSandbox,
  CreateSandboxInputSchema,
  ListSandboxesInputSchema,
} from "@kubebox/entities";
import { namespacedProcedure, router } from "../trpc.js";

export const sandboxRouter = router({
  list: namespacedProcedure
    .input(ListSandboxesInputSchema.optional())
    .query(async ({ ctx: _ctx, input: _input }): Promise<AgentSandbox[]> => {
      // TODO: wire to Kubernetes API / controller client
      return [];
    }),

  get: namespacedProcedure
    .input(z.object({ name: z.string().min(1), namespace: z.string().optional() }))
    .query(async ({ ctx: _ctx, input: _input }): Promise<AgentSandbox> => {
      // TODO: wire to Kubernetes API
      throw new TRPCError({ code: "NOT_FOUND", message: `Sandbox "${_input.name}" not found` });
    }),

  create: namespacedProcedure
    .input(CreateSandboxInputSchema)
    .mutation(async ({ ctx: _ctx, input: _input }): Promise<AgentSandbox> => {
      // TODO: wire to Kubernetes API
      throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Not implemented" });
    }),

  delete: namespacedProcedure
    .input(z.object({ name: z.string().min(1), namespace: z.string().optional() }))
    .mutation(async ({ ctx: _ctx, input: _input }): Promise<{ deleted: boolean }> => {
      // TODO: wire to Kubernetes API
      return { deleted: true };
    }),

  logs: namespacedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        namespace: z.string().optional(),
        tail: z.number().int().positive().max(10_000).default(100),
      })
    )
    .query(async ({ ctx: _ctx, input: _input }): Promise<{ lines: string[] }> => {
      // TODO: stream pod logs from Kubernetes API
      return { lines: [] };
    }),
});
