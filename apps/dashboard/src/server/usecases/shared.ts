import { OpenClawJson, Skill } from "@/entities";
import jsonPatch from "fast-json-patch";

import { ConfigAdaptor } from "./adaptors/config";

const { compare } = jsonPatch;

function deepMerge(
  dst: Record<string, unknown>,
  src: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...dst };
  for (const key of Object.keys(src)) {
    const srcVal = src[key];
    const dstVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      dstVal !== null &&
      typeof dstVal === "object" &&
      !Array.isArray(dstVal)
    ) {
      result[key] = deepMerge(dstVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export abstract class SharedUseCase {
  constructor(protected readonly config: ConfigAdaptor) {}

  protected checkOpenClawJsonAllowed(originalConfig: OpenClawJson, inputConfig: OpenClawJson): void {
    const { openClawJsonPaths } = this.config.get().allowed ?? {};
    if (openClawJsonPaths === undefined) {
      return;
    }

    const original = (originalConfig ?? {}) as Record<string, unknown>;
    const input = (inputConfig ?? {}) as Record<string, unknown>;
    const merged = deepMerge(original, input);
    const ops = compare(original, merged);

    for (const op of ops) {
      const isAllowed = openClawJsonPaths.some((pattern) => new RegExp(pattern).test(op.path));
      if (!isAllowed) {
        throw new Error(
          `Config patch is not allowed: path "${op.path}" is not in the allowed list`
        );
      }
    }
  }

  protected checkWorkspaceFileAllowed(filePath: string): void {
    const { workspaceFiles } = this.config.get().allowed ?? {};
    if (workspaceFiles === undefined) {
      return;
    }
    if (!workspaceFiles.some((pattern) => new RegExp(pattern).test(filePath))) {
      throw new Error(
        `Workspace file operation is not allowed: "${filePath}" is not in the allowed list`
      );
    }
  }

  protected checkSkillAllowed(skill: Skill): void {
    const { skills } = this.config.get().allowed ?? {};
    if (skills === undefined) {
      return;
    }
    const isAllowed = skills.some((pattern) => new RegExp(pattern).test(skill));
    if (!isAllowed) {
      throw new Error(`Skill "${skill}" is not in the allowed list`);
    }
  }

  protected checkPluginAllowed(plugin: string): void {
    const { plugins } = this.config.get().allowed ?? {};
    if (plugins === undefined) {
      return;
    }
    if (!plugins.some((pattern) => new RegExp(pattern).test(plugin))) {
      throw new Error(`Plugin "${plugin}" is not in the allowed list`);
    }
  }

  protected checkAgentTypeAllowed(agentType: string): void {
    const { agentTypes } = this.config.get();
    if (!agentTypes) {
      throw new Error("Agent types are not configured");
    }
    if (!(agentType in agentTypes)) {
      throw new Error(`Agent type "${agentType}" is not configured`);
    }
  }
}
