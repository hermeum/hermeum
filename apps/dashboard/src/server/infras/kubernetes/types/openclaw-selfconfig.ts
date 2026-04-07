/**
 * TypeScript interfaces for the OpenClawSelfConfig custom resource.
 * https://github.com/openclaw-rocks/openclaw-operator/blob/main/api/v1alpha1/openclawselfconfig_types.go
 */

import * as k8s from "@kubernetes/client-node";

// ─── SelfConfigAction ─────────────────────────────────────────────────────────

export type SelfConfigAction = "skills" | "config" | "workspaceFiles" | "envVars";

// ─── SelfConfigPhase ──────────────────────────────────────────────────────────

export type SelfConfigPhase = "Pending" | "Applied" | "Failed" | "Denied";

// ─── SelfConfigEnvVar ─────────────────────────────────────────────────────────

export interface SelfConfigEnvVar {
  name: string;
  value: string;
}

// ─── OpenClawSelfConfigSpec ───────────────────────────────────────────────────

export interface OpenClawSelfConfigSpec {
  instanceRef: string;
  addSkills?: string[];
  removeSkills?: string[];
  configPatch?: Record<string, unknown>;
  addWorkspaceFiles?: Record<string, string>;
  removeWorkspaceFiles?: string[];
  addEnvVars?: SelfConfigEnvVar[];
  removeEnvVars?: string[];
}

// ─── OpenClawSelfConfigStatus ─────────────────────────────────────────────────

export interface OpenClawSelfConfigStatus {
  phase?: SelfConfigPhase;
  message?: string;
  completionTime?: string;
}

// ─── OpenClawSelfConfig ───────────────────────────────────────────────────────

export interface OpenClawSelfConfig {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ObjectMeta;
  spec: OpenClawSelfConfigSpec;
  status?: OpenClawSelfConfigStatus;
}

// ─── OpenClawSelfConfigList ───────────────────────────────────────────────────

export interface OpenClawSelfConfigList {
  apiVersion?: string;
  kind?: string;
  metadata?: k8s.V1ListMeta;
  items: OpenClawSelfConfig[];
}
