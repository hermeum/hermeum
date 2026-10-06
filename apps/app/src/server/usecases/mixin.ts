import { parse } from "yaml";

import { Context, HermeumConfig, HermeumConfigSchema, User } from "@/entities";
import { config } from "@/server/libs/config";

import { telemetry } from "../infras/posthog";
import { KubernetesClient } from "../infras/kubernetes/client";
import { HermesSkillIndex } from "../infras/hermes-skill-index";
import { LocalFiles } from "../infras/local-files";
import { PostgresDatabase } from "../infras/postgres/client";
import { SqliteDatabase } from "../infras/sqlite/client";
import { FileAdaptor } from "./adaptors/file";
import { TelemetryAdaptor } from "./adaptors/telemetry";
import { Runtime } from "./adaptors/runtime";
import { Database } from "./adaptors/database";
import { SkillIndexAdaptor } from "./adaptors/skill-index";
import { MockRuntime } from "./adaptors/mocks/runtime";

// One MockRuntime per process: its store lives in memory, so every use case
// holding its own instance would see a different, empty one — agents created
// via AgentUseCase would be invisible to cross-use-case reads (e.g. telemetry
// ownership checks). KubernetesClient stays per-instance since it holds no
// cross-use-case state.
const sharedMockRuntime = new MockRuntime();

// Core base class for use cases backed by the file, runtime, skill index, and
// telemetry adaptors; mixins like HermeumConfigLoadable build on the injected
// adaptors.
export class BaseUseCase {
  constructor(
    readonly runtime: Runtime = config.mockRuntime
      ? sharedMockRuntime
      : new KubernetesClient(),
    readonly files: FileAdaptor = new LocalFiles(),
    readonly skillIndex: SkillIndexAdaptor = new HermesSkillIndex(),
    readonly logger: TelemetryAdaptor = telemetry,
    readonly db: Database =
      config.databaseDialect === "postgres" ? new PostgresDatabase() : new SqliteDatabase()
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
        const file = await this.files.readFile(config.configPath);
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