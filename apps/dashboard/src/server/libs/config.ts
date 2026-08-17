import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

export const ConfigSchema = z.object({
  configPath: z
    .string()
    .default("./agent-config.yaml")
    .describe("Path to the hermeum config file (HERMEUM_CONFIG_PATH)."),
  hermesDocsPath: z
    .string()
    .default("./docs/hermes-config")
    .describe("Path to the hermes-config docs directory (HERMEUM_HERMES_DOCS_PATH)."),
  databaseDialect: z
    .enum(["postgres", "sqlite"])
    .default("sqlite")
    .describe("Database backend dialect (HERMEUM_DATABASE_DIALECT)."),
  databaseUrl: z
    .url()
    .describe("Connection URL for the dashboard database (HERMEUM_DATABASE_URL)."),
  kubernetesNamespace: z
    .string()
    .default("hermeum")
    .describe("Kubernetes namespace where HermesAgent CRs are reconciled (HERMEUM_KUBERNETES_NAMESPACE)."),
  smtpUrl: z
    .url()
    .optional()
    .describe("SMTP server URL for outgoing email (HERMEUM_SMTP_URL)."),
  allowedEmailDomain: z
    .string()
    .optional()
    .describe("Restrict sign-ups to this email domain (HERMEUM_ALLOWED_EMAIL_DOMAIN)."),
  hermesImageRepository: z
    .string()
    .default("nousresearch/hermes-agent")
    .describe("Container image repository for the Hermes agent (HERMEUM_HERMES_IMAGE_REPOSITORY)."),
  hermesImageTag: z
    .string()
    .default("v2026.7.7.2")
    .describe("Container image tag for the Hermes agent (HERMEUM_HERMES_IMAGE_TAG)."),
  openaiModel: z
    .string()
    .min(1)
    .default("gpt-5.5")
    .describe("OpenAI model id used by the AI config generator (HERMEUM_OPENAI_MODEL)."),
  openaiBaseUrl: z
    .url()
    .optional()
    .describe("Override the OpenAI API base URL (HERMEUM_OPENAI_BASE_URL)."),
  logLevel: z
    .enum(["debug", "info", "warn", "error"])
    .default("info")
    .describe("Log verbosity level (HERMEUM_LOG_LEVEL)."),
  agentIngressScheme: z
    .enum(["http", "https"])
    .default("http")
    .describe(
      "Public URL scheme advertised for agent ingresses (HERMEUM_AGENT_INGRESS_SCHEME). " +
        "Display-only — does not drive the emitted tls block; TLS is governed by agentIngressTlsSecretName."
    ),
  agentIngressBaseHostname: z
    .string()
    .optional()
    .describe(
      "Base hostname for per-agent ingresses (<agent-id>.<base>) (HERMEUM_AGENT_INGRESS_BASE_HOSTNAME). " +
        "When unset, no ingress is generated."
    ),
  agentIngressClassName: z
    .string()
    .optional()
    .describe(
      "Ingress controller class name to set on generated ingresses (HERMEUM_AGENT_INGRESS_CLASS_NAME). " +
        "Omitted from the CR when unset."
    ),
  agentIngressTlsSecretName: z
    .string()
    .optional()
    .describe(
      "TLS secret name for controller-terminated TLS (HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME). " +
        "When set, the ingress emits a tls block with this secret; when unset, no tls block is " +
        "emitted (covers plain HTTP and load-balancer-terminated TLS)."
    ),
  port: z
    .number()
    .int()
    .positive()
    .default(3000)
    .describe("Port the web server listens on (HERMEUM_PORT)."),
  hmrPort: z
    .number()
    .int()
    .positive()
    .default(3001)
    .describe("Port used by Vite's HMR websocket in dev (HERMEUM_HMR_PORT)."),
  tlsCertFile: z
    .string()
    .optional()
    .describe("Path to the web TLS cert file (PEM) (HERMEUM_TLS_CERT_FILE). When set with HERMEUM_TLS_KEY_FILE, the web server serves HTTPS on HERMEUM_PORT."),
  tlsKeyFile: z
    .string()
    .optional()
    .describe("Path to the web TLS key file (PEM) (HERMEUM_TLS_KEY_FILE). When set with HERMEUM_TLS_CERT_FILE, the web server serves HTTPS on HERMEUM_PORT."),
  webhookTlsCertFile: z
    .string()
    .optional()
    .describe("Path to the mutating webhook TLS cert file (PEM) (HERMEUM_WEBHOOK_TLS_CERT_FILE). When set with HERMEUM_WEBHOOK_TLS_KEY_FILE, the webhook HTTPS listener starts on HERMEUM_WEBHOOK_PORT."),
  webhookTlsKeyFile: z
    .string()
    .optional()
    .describe("Path to the mutating webhook TLS key file (PEM) (HERMEUM_WEBHOOK_TLS_KEY_FILE). When set with HERMEUM_WEBHOOK_TLS_CERT_FILE, the webhook HTTPS listener starts on HERMEUM_WEBHOOK_PORT."),
  webhookPort: z
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(8443)
    .describe("HTTPS port for the mutating admission webhook (HERMEUM_WEBHOOK_PORT). Only used when HERMEUM_WEBHOOK_TLS_CERT_FILE and HERMEUM_WEBHOOK_TLS_KEY_FILE are set."),
});

export const config = ConfigSchema.parse({
  configPath: process.env.HERMEUM_CONFIG_PATH,
  hermesDocsPath: process.env.HERMEUM_HERMES_DOCS_PATH,
  databaseDialect: process.env.HERMEUM_DATABASE_DIALECT,
  databaseUrl: process.env.HERMEUM_DATABASE_URL,
  kubernetesNamespace: process.env.HERMEUM_KUBERNETES_NAMESPACE,
  smtpUrl: process.env.HERMEUM_SMTP_URL,
  allowedEmailDomain: process.env.HERMEUM_ALLOWED_EMAIL_DOMAIN,
  hermesImageRepository: process.env.HERMEUM_HERMES_IMAGE_REPOSITORY,
  hermesImageTag: process.env.HERMEUM_HERMES_IMAGE_TAG,
  openaiModel: process.env.HERMEUM_OPENAI_MODEL,
  openaiBaseUrl: process.env.HERMEUM_OPENAI_BASE_URL,
  logLevel: process.env.HERMEUM_LOG_LEVEL,
  agentIngressScheme: process.env.HERMEUM_AGENT_INGRESS_SCHEME,
  agentIngressBaseHostname: process.env.HERMEUM_AGENT_INGRESS_BASE_HOSTNAME,
  agentIngressClassName: process.env.HERMEUM_AGENT_INGRESS_CLASS_NAME,
  agentIngressTlsSecretName: process.env.HERMEUM_AGENT_INGRESS_TLS_SECRET_NAME,
  port: process.env.HERMEUM_PORT
    ? parseInt(process.env.HERMEUM_PORT, 10)
    : undefined,
  hmrPort: process.env.HERMEUM_HMR_PORT ? parseInt(process.env.HERMEUM_HMR_PORT, 10) : undefined,
  tlsCertFile: process.env.HERMEUM_TLS_CERT_FILE,
  tlsKeyFile: process.env.HERMEUM_TLS_KEY_FILE,
  webhookTlsCertFile: process.env.HERMEUM_WEBHOOK_TLS_CERT_FILE,
  webhookTlsKeyFile: process.env.HERMEUM_WEBHOOK_TLS_KEY_FILE,
  webhookPort: process.env.HERMEUM_WEBHOOK_PORT
    ? parseInt(process.env.HERMEUM_WEBHOOK_PORT, 10)
    : undefined,
});
