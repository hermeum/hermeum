import { z } from "zod";

import { Template } from "@/entities";
import { TemplateUseCase } from "@/server/usecases/template";
import { protectedProcedure, t } from "./shared.js";

const usecase = new TemplateUseCase();

// Fail fast: an invalid configuration file should stop the server at boot,
// not surface on the first request.
usecase.loadHermeumConfig().catch((err: Error) => {
  console.error(`\nServer failed to load the configuration file: ${err.message}\n`);
  process.exit(1);
});

export const templateRouter = t.router({
  list: protectedProcedure.query(({ ctx }): Promise<Template[]> => {
    return usecase.list(ctx);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }): Promise<Template | null> => {
      return usecase.get(ctx, input.id);
    }),
});
