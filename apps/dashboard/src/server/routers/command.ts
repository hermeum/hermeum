import { initTRPC } from "@trpc/server";
import { z } from "zod";

import { Command, RunCommandInputSchema } from "@kubebox/entities";
import { CommandUseCase } from "../usecases/command";

const usecase = new CommandUseCase();

const t = initTRPC.create();
export const commandRouter = t.router({
  run: t.procedure
    .input(RunCommandInputSchema)
    .mutation(async ({ input }): Promise<Command> => {
      return await usecase.runCommand(input);
    }),

  get: t.procedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }): Promise<Command | null> => {
      return await usecase.getCommand(input.id);
    }),
});
