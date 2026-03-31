import { z } from "zod";

export const CommandSchema = z.object({
  id: z.string(),
  sandboxName: z.string().min(1),
  command: z.array(z.string()),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  exitCode: z.number().optional(),
});

export type Command = z.infer<typeof CommandSchema>;

export const RunCommandInputSchema = z.object({
  sandboxName: z.string().min(1),
  command: z.array(z.string()),
});

export type RunCommandInput = z.infer<typeof RunCommandInputSchema>;
