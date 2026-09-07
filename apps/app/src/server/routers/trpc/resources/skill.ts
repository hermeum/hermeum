import { z } from "zod";

import { SkillSummary } from "@/entities";
import { SkillUseCase } from "@/server/usecases/skill";
import { protectedProcedure, t } from "./shared.js";

const usecase = new SkillUseCase();

export const skillRouter = t.router({
  search: protectedProcedure
    .input(
      z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .query(({ input }): Promise<SkillSummary[]> => {
      return usecase.search(input.query, input.limit);
    }),
});