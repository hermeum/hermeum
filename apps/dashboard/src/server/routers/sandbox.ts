import { initTRPC } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Sandbox, CreateSandboxInputSchema } from "@kubebox/entities";

const t = initTRPC.create();
export const sandboxRouter = t.router({
  list: t.procedure.query(async (): Promise<Sandbox[]> => {
    // TODO: wire to Kubernetes API / controller client
    console.info("test");
    return [];
  }),

  get: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }): Promise<Sandbox> => {
      // TODO: wire to Kubernetes API
      throw new TRPCError({ code: "NOT_FOUND", message: `Sandbox "${input.name}" not found` });
    }),

  create: t.procedure.input(CreateSandboxInputSchema).mutation(async (): Promise<Sandbox> => {
    // TODO: wire to Kubernetes API
    throw new TRPCError({ code: "NOT_IMPLEMENTED", message: "Not implemented" });
  }),

  delete: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input: _input }): Promise<{ deleted: boolean }> => {
      // TODO: wire to Kubernetes API
      return { deleted: true };
    }),

  logs: t.procedure
    .input(
      z.object({
        name: z.string().min(1),
        tail: z.number().int().positive().max(10_000).default(100),
      })
    )
    .query(async (): Promise<{ lines: string[] }> => {
      // TODO: stream pod logs from Kubernetes API
      return { lines: [] };
    }),
});
