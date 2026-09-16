import { z } from "zod";

// Reference to a sensitive env var holding the actual secret value. Hermes
// supports env var substitution in config.yaml (${VAR_NAME}; unresolved
// references are kept verbatim and logged), so the config carries only the
// reference while the real value lives in the agent's sensitive env entry —
// literal secret values are rejected.
// https://hermes-agent.nousresearch.com/docs/user-guide/configuration#environment-variable-substitution
export const SecretRefSchema = z
  .string()
  .regex(
    /^\$\{[A-Z][A-Z0-9_]*\}$/,
    'Secret must be an env var reference like "${WEBHOOK_SECRET}" — ' +
      "write the actual value into a sensitive env var instead of config.yaml."
  )
  .describe(
    "Reference to the sensitive env var holding the actual secret, " +
      'e.g. "${WEBHOOK_SECRET}". The var name is not fixed — any name works ' +
      "as long as a matching env entry exists. Hermes substitutes the env " +
      "var at config load — never write the literal secret value into " +
      "config.yaml, and always pair the reference with an env entry marked " +
      "sensitive: true."
  );

export type SecretRef = z.infer<typeof SecretRefSchema>;