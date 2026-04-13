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

  protected checkConfigPatchAllowed(originalConfig: OpenClawJson, inputConfig: OpenClawJson): void {
    const { allowedConfigPaths } = this.config.get();
    if (allowedConfigPaths === undefined) {
      return;
    }

    const original = (originalConfig ?? {}) as Record<string, unknown>;
    const input = (inputConfig ?? {}) as Record<string, unknown>;
    const merged = deepMerge(original, input);
    const ops = compare(original, merged);

    for (const op of ops) {
      const isAllowed = allowedConfigPaths.some(
        (allowed) => op.path === allowed || op.path.startsWith(allowed + "/")
      );
      if (!isAllowed) {
        throw new Error(
          `Config patch is not allowed: path "${op.path}" is not in the allowed list`
        );
      }
    }
  }

  protected checkWorkspaceFileAllowed(filePath: string): void {
    const { allowedWorkspaceFiles } = this.config.get();
    if (allowedWorkspaceFiles === undefined) {
      return;
    }
    if (!allowedWorkspaceFiles.includes(filePath)) {
      throw new Error(
        `Workspace file operation is not allowed: "${filePath}" is not in the allowed list`
      );
    }
  }

  protected checkSkillAllowed(skill: Skill): void {
    const { allowedSkills } = this.config.get();
    if (allowedSkills === undefined) {
      return;
    }
    const isAllowed = allowedSkills.some((pattern) => new RegExp(pattern).test(skill));
    if (!isAllowed) {
      throw new Error(`Skill "${skill}" is not in the allowed list`);
    }
  }
}
