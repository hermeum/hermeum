import { z } from "zod";

import { Template } from "@/entities";
import { LocalConfig } from "@/server/infras/local-agent-config";
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
  list: protectedProcedure.query((): Template[] => {
    return usecase.list();
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }): Template | null => {
      return usecase.get(input.id);
    }),
});
