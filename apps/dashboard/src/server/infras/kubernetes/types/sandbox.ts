import * as k8s from "@kubernetes/client-node";

export const SandboxConditionReady = "Ready";
export const SandboxReasonExpired = "SandboxExpired";
export const SandboxPodNameAnnotation = "agents.x-k8s.io/pod-name";
export const SandboxTemplateRefAnnotation = "agents.x-k8s.io/sandbox-template-ref";

export type ShutdownPolicy = "Delete" | "Retain";

export interface Lifecycle {
  shutdownTime?: string; // ISO 8601 date-time
  shutdownPolicy?: ShutdownPolicy;
}

export interface PodMetadata {
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface EmbeddedObjectMetadata {
  name?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface PodTemplate {
  spec: k8s.V1PodSpec;
  metadata?: PodMetadata;
}

export interface PersistentVolumeClaimTemplate {
  metadata?: EmbeddedObjectMetadata;
  spec: k8s.V1PersistentVolumeClaimSpec;
}

export interface SandboxSpec extends Lifecycle {
  podTemplate: PodTemplate;
  volumeClaimTemplates?: PersistentVolumeClaimTemplate[];
  replicas?: number;
}

export interface SandboxStatus {
  serviceFQDN?: string;
  service?: string;
  conditions?: k8s.V1Condition[];
  replicas?: number;
  selector?: string;
}

export interface Sandbox {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ObjectMeta;
  spec: SandboxSpec;
  status?: SandboxStatus;
}

export interface SandboxList {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ListMeta;
  items: Sandbox[];
}
