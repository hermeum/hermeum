import { z } from "zod";

import { Template } from "@/entities";
import { LocalConfig } from "@/server/usecases/infras/local-hermeum-config";
import { TemplateUseCase } from "@/server/usecases/template";
import { protectedProcedure, t } from "./shared.js";

let usecase: TemplateUseCase;
try {
  usecase = new TemplateUseCase(new LocalConfig());
} catch (err) {
  console.error(`\nServer failed to load the configuration file: ${(err as Error).message}\n`);
  process.exit(1);
}

export const templateRouter = t.router({
  list: protectedProcedure.query(({ ctx }): Template[] => {
    return usecase.list(ctx);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }): Template | null => {
      return usecase.get(ctx, input.id);
    }),
});
