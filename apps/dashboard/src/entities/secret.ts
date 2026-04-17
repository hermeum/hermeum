import { z } from "zod";

export const SecretEnvVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[-._a-zA-Z0-9]+$/,
      "A environment variable name must consist of alphanumeric characters, '-', '_' or '.'"
    ),
});
export type SecretEnvVar = z.infer<typeof SecretEnvVarSchema>;

export const SecretSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  envVars: z.array(SecretEnvVarSchema),
  archived: z.boolean().optional(),
  createdAt: z.date().optional().readonly(),
});
export type Secret = z.infer<typeof SecretSchema>;
