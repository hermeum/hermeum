import { initTRPC } from "@trpc/server";
import { z } from "zod";

import { CreateSandboxInputSchema, Sandbox } from "@kubebox/entities";
import { SandboxUseCase } from "../usecases/sandbox";

const usecase = new SandboxUseCase();

const t = initTRPC.create();
export const sandboxRouter = t.router({
  list: t.procedure.query(async (): Promise<Sandbox[]> => {
    return await usecase.listSandboxes();
  }),

  get: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input }): Promise<Sandbox | null> => {
      return await usecase.getSandbox(input.name);
    }),

  create: t.procedure
    .input(CreateSandboxInputSchema)
    .mutation(async ({ input }): Promise<Sandbox> => {
      return await usecase.createSandbox(input);
    }),

  delete: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }): Promise<void> => {
      return await usecase.deleteSandbox(input.name);
    }),

  getSandbox: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ input: _input }): Promise<Sandbox> => {
      return {} as Sandbox;
    }),

  resume: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input: _input }): Promise<Sandbox> => {
      return {} as Sandbox;
    }),

  pause: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input: _input }): Promise<Sandbox> => {
      return {} as Sandbox;
    }),

  extendShutdownTime: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input: _input }): Promise<Sandbox> => {
      return {} as Sandbox;
    }),
});
