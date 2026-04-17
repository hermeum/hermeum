import { z } from "zod";

export const SecretEnvVarSchema = z.object({ name: z.string().min(1) });
export type SecretEnvVar = z.infer<typeof SecretEnvVarSchema>;

export const SecretSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  envVars: z.array(SecretEnvVarSchema),
});
export type Secret = z.infer<typeof SecretSchema>;
