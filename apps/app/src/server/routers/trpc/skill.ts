import { z } from "zod";

import { SkillSummary } from "@/entities";
import { SkillUseCase } from "@/server/usecases/skill";
import { protectedProcedure, t } from "./shared.js";

const usecase = new SkillUseCase();

export const skillRouter = t.router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(({ input }): Promise<SkillSummary[]> => {
      return usecase.list(input?.limit);
    }),
});