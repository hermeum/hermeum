import * as k8s from "@kubernetes/client-node";

export type ShutdownPolicy = "Delete" | "Retain";

export interface Lifecycle {
  shutdownTime?: string; // ISO 8601 date-time
  shutdownPolicy?: ShutdownPolicy;
}

export interface SandboxTemplateRef {
  name: string;
}

export interface SandboxClaimSpec {
  sandboxTemplateRef: SandboxTemplateRef;
  lifecycle?: Lifecycle;
}

export interface SandboxClaimStatus {
  conditions?: k8s.V1Condition[];
  sandbox?: {
    Name?: string;
  };
}

export interface SandboxClaim {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ObjectMeta;
  spec: SandboxClaimSpec;
  status?: SandboxClaimStatus;
}

export interface SandboxClaimList {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ListMeta;
  items: SandboxClaim[];
}
