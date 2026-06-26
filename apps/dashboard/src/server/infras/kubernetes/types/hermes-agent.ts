/**
 * TypeScript interfaces for the HermesAgent custom resource.
 * Derived from hermes-agent-operator api/v1alpha1 types.
 */

import * as k8s from "@kubernetes/client-node";

// ─── Phase ────────────────────────────────────────────────────────────────────

export type HermesAgentPhase =
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "Unknown"
  | "Suspended";

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface HermesPersistence {
  enabled?: boolean | undefined;
  size?: string | undefined;
  storageClassName?: string | undefined;
  existingClaim?: string | undefined;
}

export interface HermesStorage {
  persistence?: HermesPersistence | undefined;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface HermesDotEnv {
  secretRef: { name: string };
}

export interface HermesWorkspace {
  files?: Record<string, string> | undefined;
  dotEnv?: HermesDotEnv | undefined;
}

// ─── Plugins & Skills ─────────────────────────────────────────────────────────

export interface HermesPlugin {
  identifier: string;
  enable?: boolean | undefined;
}

export interface HermesSkill {
  identifier: string;
  category?: string | undefined;
  name?: string | undefined;
  force?: boolean | undefined;
}

// ─── Crons & Bundles ──────────────────────────────────────────────────────────

export interface HermesCron {
  name: string;
  schedule: string;
  prompt?: string | undefined;
  deliver?: string | undefined;
  repeat?: number | undefined;
  skills?: string[] | undefined;
  script?: string | undefined;
  noAgent?: boolean | undefined;
  workdir?: string | undefined;
  profile?: string | undefined;
}

export interface HermesBundle {
  name: string;
  skills?: string[] | undefined;
  description?: string | undefined;
  instruction?: string | undefined;
  force?: boolean | undefined;
}

// ─── Python & NPM Packages ────────────────────────────────────────────────────

export interface HermesPipPackages {
  install?: string[] | undefined;
  extraArgs?: string[] | undefined;
}

export interface HermesNpmPackages {
  install?: string[] | undefined;
}

export interface HermesPackages {
  pip?: HermesPipPackages | undefined;
  npm?: HermesNpmPackages | undefined;
}

// ─── Image ────────────────────────────────────────────────────────────────────

export interface HermesImage {
  repository?: string | undefined;
  tag?: string | undefined;
}

// ─── Security ─────────────────────────────────────────────────────────────────

export interface RBACRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
}

export interface RBAC {
  createServiceAccount?: boolean | undefined;
  serviceAccountName?: string | undefined;
  serviceAccountAnnotations?: Record<string, string> | undefined;
  additionalRules?: RBACRule[] | undefined;
}

export interface NetworkPolicy {
  enabled?: boolean | undefined;
  allowedIngressCIDRs?: string[] | undefined;
  allowedIngressNamespaces?: string[] | undefined;
  allowedEgressCIDRs?: string[] | undefined;
  allowDNS?: boolean | undefined;
  additionalEgress?: k8s.V1NetworkPolicyEgressRule[] | undefined;
}

export interface HermesSecurity {
  rbac?: RBAC | undefined;
  networkPolicy?: NetworkPolicy | undefined;
}

// ─── API Server & Webhook ─────────────────────────────────────────────────────

export interface HermesAPIServer {
  enabled?: boolean | undefined;
  port?: number | undefined;
  corsOrigins?: string[] | undefined;
  existingSecret?: k8s.V1SecretKeySelector | undefined;
}

export interface HermesWebhook {
  enabled?: boolean | undefined;
  port?: number | undefined;
  secretRef?: k8s.V1SecretKeySelector | undefined;
}

export interface HermesConfig {
  raw?: Record<string, unknown> | undefined;
  apiServer?: HermesAPIServer | undefined;
  webhook?: HermesWebhook | undefined;
}

// ─── Init Scripts ─────────────────────────────────────────────────────────────

export interface HermesInitScript {
  name: string;
  script: string;
}

// ─── Probes ───────────────────────────────────────────────────────────────────

export interface Probe {
  enabled?: boolean | undefined;
  initialDelaySeconds?: number | undefined;
  periodSeconds?: number | undefined;
  timeoutSeconds?: number | undefined;
  failureThreshold?: number | undefined;
}

export interface Probes {
  liveness?: Probe | undefined;
  readiness?: Probe | undefined;
  startup?: Probe | undefined;
}

// ─── Hermes (main agent spec section) ────────────────────────────────────────

export interface Hermes {
  image?: HermesImage | undefined;
  config?: HermesConfig | undefined;
  storage?: HermesStorage | undefined;
  workspace?: HermesWorkspace | undefined;
  packages?: HermesPackages | undefined;
  plugins?: HermesPlugin[] | undefined;
  skills?: HermesSkill[] | undefined;
  crons?: HermesCron[] | undefined;
  bundles?: HermesBundle[] | undefined;
  envFrom?: k8s.V1EnvFromSource[] | undefined;
  resources?: k8s.V1ResourceRequirements | undefined;
  probes?: Probes | undefined;
  ports?: k8s.V1ContainerPort[] | undefined;
  initChownData?: boolean | undefined;
  initScripts?: HermesInitScript[] | undefined;
}

// ─── Networking ───────────────────────────────────────────────────────────────

export interface ServicePort {
  name: string;
  port: number;
  targetPort?: number | undefined;
  protocol?: "TCP" | "UDP" | "SCTP" | undefined;
}

export interface Service {
  type?: "ClusterIP" | "LoadBalancer" | "NodePort" | undefined;
  annotations?: Record<string, string> | undefined;
  ports?: ServicePort[] | undefined;
}

export interface IngressPath {
  path?: string | undefined;
  pathType?: "Prefix" | "Exact" | "ImplementationSpecific" | undefined;
  port: number;
}

export interface IngressHost {
  host: string;
  paths: IngressPath[];
}

export interface IngressTLS {
  hosts?: string[] | undefined;
  secretName?: string | undefined;
}

export interface Ingress {
  enabled?: boolean | undefined;
  className?: string | undefined;
  annotations?: Record<string, string> | undefined;
  hosts?: IngressHost[] | undefined;
  tls?: IngressTLS[] | undefined;
}

export interface Networking {
  service?: Service | undefined;
  ingress?: Ingress | undefined;
}

// ─── SearXNG ──────────────────────────────────────────────────────────────────

export interface SearXNGImage {
  repository?: string | undefined;
  tag?: string | undefined;
}

export interface SearXNGPersistence {
  enabled?: boolean | undefined;
  size?: string | undefined;
  storageClassName?: string | undefined;
  existingClaim?: string | undefined;
}

export interface SearXNG {
  enabled?: boolean | undefined;
  image?: SearXNGImage | undefined;
  resources?: k8s.V1ResourceRequirements | undefined;
  configFiles?: Record<string, string> | undefined;
  persistence?: SearXNGPersistence | undefined;
  env?: k8s.V1EnvVar[] | undefined;
}

// ─── Camofox ──────────────────────────────────────────────────────────────────

export interface CamofoxImageSpec {
  repository?: string | undefined;
  tag?: string | undefined;
}

export interface CamofoxPersistenceSpec {
  enabled?: boolean | undefined;
  size?: string | undefined;
  storageClassName?: string | undefined;
  existingClaim?: string | undefined;
}

export interface Camofox {
  enabled?: boolean | undefined;
  image?: CamofoxImageSpec | undefined;
  resources?: k8s.V1ResourceRequirements | undefined;
  persistence?: CamofoxPersistenceSpec | undefined;
  env?: k8s.V1EnvVar[] | undefined;
}

// ─── HermesAgentSpec ──────────────────────────────────────────────────────────

export interface HermesAgentSpec {
  suspend?: boolean | undefined;
  hermes?: Hermes | undefined;
  security?: HermesSecurity | undefined;
  networking?: Networking | undefined;
  initContainers?: k8s.V1Container[] | undefined;
  sidecars?: k8s.V1Container[] | undefined;
  extraVolumes?: k8s.V1Volume[] | undefined;
  extraVolumeMounts?: k8s.V1VolumeMount[] | undefined;
  searxng?: SearXNG | undefined;
  camofox?: Camofox | undefined;
}

// ─── ManagedResources ─────────────────────────────────────────────────────────

export interface ManagedResources {
  hermesConfigMap?: string | undefined;
  hermesSecret?: string | undefined;
  searxngConfigMap?: string | undefined;
  searxngSecret?: string | undefined;
  serviceAccount?: string | undefined;
  role?: string | undefined;
  roleBinding?: string | undefined;
  service?: string | undefined;
  ingress?: string | undefined;
  networkPolicy?: string | undefined;
  statefulSet?: string | undefined;
}

// ─── HermesAgentStatus ───────────────────────────────────────────────────────

export interface HermesAgentStatus {
  phase?: HermesAgentPhase | undefined;
  reason?: string | undefined;
  conditions?: k8s.V1Condition[] | undefined;
  managedResources?: ManagedResources | undefined;
}

// ─── HermesAgent ─────────────────────────────────────────────────────────────

export interface HermesAgent {
  apiVersion?: string | undefined;
  kind?: string | undefined;
  metadata?: k8s.V1ObjectMeta | undefined;
  spec: HermesAgentSpec;
  status?: HermesAgentStatus | undefined;
}

// ─── HermesAgentList ─────────────────────────────────────────────────────────

export interface HermesAgentList {
  apiVersion?: string | undefined;
  kind?: string | undefined;
  metadata?: k8s.V1ListMeta | undefined;
  items: HermesAgent[];
}
