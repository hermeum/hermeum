import { z } from "zod";

export const EnvVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[-._a-zA-Z0-9]+$/,
      "A environment variable name must consist of alphanumeric characters, '-', '_' or '.'"
    ),
  value: z.string(),
});

export type EnvVar = z.infer<typeof EnvVarSchema>;

export const SharedEnvSetEnvVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[-._a-zA-Z0-9]+$/,
      "A environment variable name must consist of alphanumeric characters, '-', '_' or '.'"
    ),
});
export type SharedEnvSetEnvVar = z.infer<typeof SharedEnvSetEnvVarSchema>;

export const SharedEnvSetSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  envVars: z.array(SharedEnvSetEnvVarSchema),
  archived: z.boolean().optional(),
  createdAt: z.date().optional().readonly(),
});
export type SharedEnvSet = z.infer<typeof SharedEnvSetSchema>;
