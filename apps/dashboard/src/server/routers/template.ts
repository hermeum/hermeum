import { initTRPC } from "@trpc/server";
import { z } from "zod";

import { Template } from "@/entities";
import { LocalConfig } from "../infras/local-config";
import { TemplateUseCase } from "../usecases/template";

let usecase: TemplateUseCase;
try {
  usecase = new TemplateUseCase(new LocalConfig());
} catch (err) {
  console.error(`\nServer failed to load the configuration file: ${(err as Error).message}\n`);
  process.exit(1);
}

const t = initTRPC.create();
export const templateRouter = t.router({
  list: t.procedure.query((): Template[] => {
    return usecase.list();
  }),

  get: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }): Template | null => {
      return usecase.get(input.name);
    }),
});
