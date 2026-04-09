/**
 * TypeScript interfaces for the OpenClawInstance custom resource.
 * https://github.com/openclaw-rocks/openclaw-operator/blob/main/api/v1alpha1/openclawinstance_types.go
 */

import * as k8s from "@kubernetes/client-node";

import { SelfConfigAction } from "./openclaw-selfconfig";

// ─── Image ────────────────────────────────────────────────────────────────────

export interface ImageSpec {
  repository?: string;
  tag?: string;
  digest?: string;
  pullPolicy?: "Always" | "IfNotPresent" | "Never";
  pullSecrets?: { name: string }[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ConfigMapKeySelector {
  name: string;
  key?: string | undefined;
}

export interface ConfigMapNameSelector {
  name: string;
}

export interface ConfigSpec {
  configMapRef?: ConfigMapKeySelector | undefined;
  raw?: Record<string, unknown> | undefined;
  mergeMode?: "overwrite" | "merge" | undefined;
  format?: "json" | "json5" | undefined;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface AdditionalWorkspace {
  name: string;
  configMapRef?: ConfigMapNameSelector;
  initialFiles?: Record<string, string>;
  initialDirectories?: string[];
}

export interface WorkspaceSpec {
  configMapRef?: ConfigMapNameSelector;
  initialFiles?: Record<string, string> | undefined;
  initialDirectories?: string[];
  additionalWorkspaces?: AdditionalWorkspace[];
}

// ─── Resources ────────────────────────────────────────────────────────────────

export interface ResourceList {
  cpu?: string;
  memory?: string;
}

export interface ResourcesSpec {
  requests?: ResourceList;
  limits?: ResourceList;
}

// ─── Security ─────────────────────────────────────────────────────────────────

export interface CABundleSpec {
  configMapName?: string;
  secretName?: string;
  key?: string;
}

export interface PodSecurityContextSpec {
  runAsUser?: number;
  runAsGroup?: number;
  fsGroup?: number;
  fsGroupChangePolicy?: "OnRootMismatch" | "Always";
  runAsNonRoot?: boolean;
}

export interface ContainerSecurityContextSpec {
  allowPrivilegeEscalation?: boolean;
  readOnlyRootFilesystem?: boolean;
  capabilities?: k8s.V1Capabilities;
  runAsNonRoot?: boolean;
  runAsUser?: number;
}

export interface NetworkPolicySpec {
  enabled?: boolean;
  allowedIngressCIDRs?: string[];
  allowedIngressNamespaces?: string[];
  allowedEgressCIDRs?: string[];
  allowDNS?: boolean;
  additionalEgress?: k8s.V1NetworkPolicyEgressRule[];
}

export interface RBACRule {
  apiGroups: string[];
  resources: string[];
  verbs: string[];
}

export interface RBACSpec {
  createServiceAccount?: boolean;
  serviceAccountName?: string;
  serviceAccountAnnotations?: Record<string, string>;
  additionalRules?: RBACRule[];
}

export interface SecuritySpec {
  podSecurityContext?: PodSecurityContextSpec;
  containerSecurityContext?: ContainerSecurityContextSpec;
  networkPolicy?: NetworkPolicySpec;
  rbac?: RBACSpec;
  caBundle?: CABundleSpec;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface PersistenceSpec {
  enabled?: boolean;
  storageClass?: string;
  size?: string;
  accessModes?: string[];
  existingClaim?: string;
  orphan?: boolean;
}

export interface StorageSpec {
  persistence?: PersistenceSpec;
}

// ─── Backup ───────────────────────────────────────────────────────────────────

export interface BackupSpec {
  schedule?: string;
  historyLimit?: number;
  failedHistoryLimit?: number;
  timeout?: string;
  serviceAccountName?: string;
  retentionDays?: number;
}

// ─── Chromium ─────────────────────────────────────────────────────────────────

export interface ChromiumImageSpec {
  repository?: string;
  tag?: string;
  digest?: string;
}

export interface ChromiumPersistenceSpec {
  enabled?: boolean;
  storageClass?: string;
  size?: string;
  existingClaim?: string;
}

export interface ChromiumSpec {
  enabled?: boolean;
  image?: ChromiumImageSpec;
  resources?: ResourcesSpec;
  persistence?: ChromiumPersistenceSpec;
  extraArgs?: string[];
  extraEnv?: k8s.V1EnvVar[];
}

// ─── Tailscale ────────────────────────────────────────────────────────────────

export interface TailscaleImageSpec {
  repository?: string;
  tag?: string;
  digest?: string;
}

export interface TailscaleSpec {
  enabled?: boolean;
  mode?: "serve" | "funnel";
  image?: TailscaleImageSpec;
  authKeySecretRef?: { name: string };
  authKeySecretKey?: string;
  hostname?: string;
  authSSO?: boolean;
  resources?: ResourcesSpec;
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

export interface OllamaImageSpec {
  repository?: string;
  tag?: string;
  digest?: string;
}

export interface OllamaStorageSpec {
  sizeLimit?: string;
  existingClaim?: string;
}

export interface OllamaSpec {
  enabled?: boolean;
  image?: OllamaImageSpec;
  models?: string[];
  resources?: ResourcesSpec;
  storage?: OllamaStorageSpec;
  gpu?: number;
}

// ─── Web Terminal ─────────────────────────────────────────────────────────────

export interface WebTerminalImageSpec {
  repository?: string;
  tag?: string;
  digest?: string;
}

export interface WebTerminalCredentialSpec {
  secretRef: { name: string };
}

export interface WebTerminalSpec {
  enabled?: boolean;
  image?: WebTerminalImageSpec;
  resources?: ResourcesSpec;
  readOnly?: boolean;
  credential?: WebTerminalCredentialSpec;
}

// ─── Networking ───────────────────────────────────────────────────────────────

export interface ServicePortSpec {
  name: string;
  port: number;
  targetPort?: number;
  protocol?: "TCP" | "UDP" | "SCTP";
}

export interface ServiceSpec {
  type?: "ClusterIP" | "LoadBalancer" | "NodePort";
  annotations?: Record<string, string>;
  ports?: ServicePortSpec[];
}

export interface IngressPath {
  path?: string;
  pathType?: "Prefix" | "Exact" | "ImplementationSpecific";
  port?: number;
}

export interface IngressHost {
  host: string;
  paths?: IngressPath[];
}

export interface IngressTLS {
  hosts?: string[];
  secretName?: string;
}

export interface RateLimitingSpec {
  enabled?: boolean;
  requestsPerSecond?: number;
}

export interface IngressBasicAuthSpec {
  enabled?: boolean;
  existingSecret?: string;
  username?: string;
  realm?: string;
}

export interface IngressSecuritySpec {
  forceHTTPS?: boolean;
  enableHSTS?: boolean;
  rateLimiting?: RateLimitingSpec;
  basicAuth?: IngressBasicAuthSpec;
}

export interface IngressSpec {
  enabled?: boolean;
  className?: string;
  annotations?: Record<string, string>;
  hosts?: IngressHost[];
  tls?: IngressTLS[];
  security?: IngressSecuritySpec;
}

export interface NetworkingSpec {
  service?: ServiceSpec;
  ingress?: IngressSpec;
}

// ─── Probes ───────────────────────────────────────────────────────────────────

export interface ProbeSpec {
  enabled?: boolean;
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
}

export interface ProbesSpec {
  liveness?: ProbeSpec;
  readiness?: ProbeSpec;
  startup?: ProbeSpec;
}

// ─── Observability ────────────────────────────────────────────────────────────

export interface ServiceMonitorSpec {
  enabled?: boolean;
  interval?: string;
  labels?: Record<string, string>;
}

export interface PrometheusRuleSpec {
  enabled?: boolean;
  labels?: Record<string, string>;
  runbookBaseURL?: string;
}

export interface GrafanaDashboardSpec {
  enabled?: boolean;
  labels?: Record<string, string>;
  folder?: string;
}

export interface MetricsSpec {
  enabled?: boolean;
  port?: number;
  serviceMonitor?: ServiceMonitorSpec;
  prometheusRule?: PrometheusRuleSpec;
  grafanaDashboard?: GrafanaDashboardSpec;
}

export interface LoggingSpec {
  level?: "debug" | "info" | "warn" | "error";
  format?: "json" | "text";
}

export interface ObservabilitySpec {
  metrics?: MetricsSpec;
  logging?: LoggingSpec;
}

// ─── Availability ─────────────────────────────────────────────────────────────

export interface PodDisruptionBudgetSpec {
  enabled?: boolean;
  maxUnavailable?: number;
}

export interface AutoScalingSpec {
  enabled?: boolean;
  minReplicas?: number;
  maxReplicas?: number;
  targetCPUUtilization?: number;
  targetMemoryUtilization?: number;
}

export interface AvailabilitySpec {
  podDisruptionBudget?: PodDisruptionBudgetSpec;
  autoScaling?: AutoScalingSpec;
  nodeSelector?: Record<string, string>;
  tolerations?: k8s.V1Toleration[];
  affinity?: k8s.V1Affinity;
  topologySpreadConstraints?: k8s.V1TopologySpreadConstraint[];
  runtimeClassName?: string;
}

// ─── Auto Update ──────────────────────────────────────────────────────────────

export interface AutoUpdateSpec {
  enabled?: boolean;
  checkInterval?: string;
  backupBeforeUpdate?: boolean;
  rollbackOnFailure?: boolean;
  healthCheckTimeout?: string;
}

export interface AutoUpdateStatus {
  lastCheckTime?: string;
  latestVersion?: string;
  currentVersion?: string;
  pendingVersion?: string;
  updatePhase?: "" | "BackingUp" | "ApplyingUpdate" | "HealthCheck" | "RollingBack";
  lastUpdateTime?: string;
  lastUpdateError?: string;
  previousVersion?: string;
  preUpdateBackupPath?: string;
  failedVersion?: string;
  rollbackCount?: number;
}

// ─── Runtime Deps ─────────────────────────────────────────────────────────────

export interface RuntimeDepsSpec {
  pnpm?: boolean;
  python?: boolean;
}

// ─── Gateway ──────────────────────────────────────────────────────────────────

export interface GatewaySpec {
  enabled?: boolean;
  existingSecret?: string;
  controlUiOrigins?: string[];
}

// ─── Self Configure ───────────────────────────────────────────────────────────

export interface SelfConfigureSpec {
  enabled?: boolean | undefined;
  allowedActions?: SelfConfigAction[] | undefined;
}

// ─── OpenClawInstanceSpec ─────────────────────────────────────────────────────

export interface OpenClawInstanceSpec {
  registry?: string;
  image?: ImageSpec;
  config?: ConfigSpec;
  workspace?: WorkspaceSpec;
  skills?: string[];
  plugins?: string[];
  envFrom?: k8s.V1EnvFromSource[];
  env?: k8s.V1EnvVar[];
  resources?: ResourcesSpec;
  security?: SecuritySpec;
  storage?: StorageSpec;
  chromium?: ChromiumSpec;
  tailscale?: TailscaleSpec;
  ollama?: OllamaSpec;
  webTerminal?: WebTerminalSpec;
  initContainers?: k8s.V1Container[];
  sidecars?: k8s.V1Container[];
  sidecarVolumes?: k8s.V1Volume[];
  extraVolumes?: k8s.V1Volume[];
  extraVolumeMounts?: k8s.V1VolumeMount[];
  networking?: NetworkingSpec;
  probes?: ProbesSpec;
  observability?: ObservabilitySpec;
  availability?: AvailabilitySpec;
  suspended?: boolean;
  backup?: BackupSpec;
  restoreFrom?: string;
  runtimeDeps?: RuntimeDepsSpec;
  gateway?: GatewaySpec;
  autoUpdate?: AutoUpdateSpec;
  selfConfigure?: SelfConfigureSpec;
  podAnnotations?: Record<string, string>;
}

// ─── OpenClawInstanceStatus ───────────────────────────────────────────────────

export interface OpenClawInstanceStatus {
  conditions?: k8s.V1Condition[];
  autoUpdate?: AutoUpdateStatus;
}

// ─── OpenClawInstance ─────────────────────────────────────────────────────────

export interface OpenClawInstance {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ObjectMeta;
  spec: OpenClawInstanceSpec;
  status?: OpenClawInstanceStatus;
}

// ─── OpenClawInstanceList ─────────────────────────────────────────────────────

export interface OpenClawInstanceList {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ListMeta;
  items: OpenClawInstance[];
}
