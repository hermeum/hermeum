import { parse } from "yaml";

import { Context, HermeumConfig, HermeumConfigSchema, User } from "@/entities";
import { config } from "@/server/libs/config";

import { KubernetesClient } from "../infras/kubernetes/client";
import { HermesSkillIndexAdaptor } from "../infras/hermes-skill-index";
import { LocalFiles } from "../infras/local-files";
import { FileAdaptor } from "./adaptors/file";
import { Runtime } from "./adaptors/runtime";
import { SkillIndexAdaptor } from "./adaptors/skill-index";

// Core base class for use cases backed by the file, runtime, and skill index
// adaptors; mixins like HermeumConfigLoadable build on the injected adaptors.
export class BaseUseCase {
  constructor(
    readonly runtime: Runtime = new KubernetesClient(),
    readonly files: FileAdaptor = new LocalFiles(),
    readonly skillIndex: SkillIndexAdaptor = new HermesSkillIndexAdaptor()
  ) {}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor<T = object> = new (...args: any[]) => T;

// Mixin adding Hermeum config loading to a use case class whose base provides
// the file adaptor (e.g. BaseUseCase). The validated config is cached once
// per instance (routers hold singleton use cases, so effectively once per
// process). Compose with:
//   class MyUseCase extends HermeumConfigLoadable(BaseUseCase) { ... }
export function HermeumConfigLoadable<TBase extends Constructor<{ files: FileAdaptor }>>(
  Base: TBase
) {
  return class extends Base {
    #cachedHermeumConfig?: HermeumConfig;

    async loadHermeumConfig(): Promise<HermeumConfig> {
      if (!this.#cachedHermeumConfig) {
        const file = await this.files.readFile(config.agentConfigPath);
        const raw = file === null ? { templates: [] } : parse(file.content);
        this.#cachedHermeumConfig = HermeumConfigSchema.parse(raw);
      }
      return this.#cachedHermeumConfig;
    }
  };
}

// Mixin adding resource-ownership authorization to a use case class. The
// protectedProcedure router gate guarantees a session is present, but the
// Context type still carries a nullable user, so requireUser centralizes the
// non-null assertion as defense-in-depth. Compose with:
//   class MyUseCase extends OwnershipGuarded(BaseUseCase) { ... }
export function OwnershipGuarded<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    requireUser(ctx: Context): User {
      if (!ctx.user) {
        throw new Error("Not authenticated");
      }
      return ctx.user;
    }

    verifyOwnership(ctx: Context, resource: { userId: string }): void {
      if (this.requireUser(ctx).id !== resource.userId) {
        throw new Error("You don't have permission to perform this action");
      }
    }
  };
}