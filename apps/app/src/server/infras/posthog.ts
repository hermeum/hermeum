import { randomUUID } from "node:crypto";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { AnyValueMap } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PostHog } from "posthog-node";

import { config } from "@/server/libs/config";
import type { LogContext, LogLevel, TelemetryAdaptor } from "@/server/usecases/adaptors/telemetry.js";

import pkg from "../../../package.json";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SEVERITY: Record<LogLevel, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export const HEARTBEAT_EVENT = "deployment.heartbeat";
export const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000;

export type PostHogTelemetryOptions = {
  logLevel: LogLevel;
  posthogApiKey?: string | undefined;
  posthogHost: string;
  deploymentId?: string | undefined;
  telemetryDisabled: boolean;
};

export class PostHogTelemetry implements TelemetryAdaptor {
  #level: LogLevel;
  #sdk?: NodeSDK;
  #events: PostHog;
  #distinctId: string;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: PostHogTelemetryOptions) {
    this.#level = options.logLevel;
    this.#distinctId = options.deploymentId ?? randomUUID();
    this.#events = new PostHog(options.posthogApiKey ?? "", { host: options.posthogHost });
    if (!options.telemetryDisabled && options.posthogApiKey) {
      this.#sdk = new NodeSDK({
        resource: resourceFromAttributes({
          "service.name": "hermeum",
          "service.version": pkg.version,
        }),
        logRecordProcessor: new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${options.posthogHost}/i/v1/logs`,
            headers: { Authorization: `Bearer ${options.posthogApiKey}` },
          }),
        }),
      });
      this.#sdk.start();
    }
    this.#timer = setInterval(() => this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.#timer.unref();
  }

  debug(message: string, context?: LogContext): void {
    this.#emit("debug", console.debug, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.#emit("info", console.info, message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.#emit("warn", console.warn, message, context);
  }

  error(message: string, context?: LogContext): void {
    this.#emit("error", console.error, message, context);
  }

  heartbeat(properties: LogContext = {}): void {
    this.#events.capture({
      distinctId: this.#distinctId,
      event: HEARTBEAT_EVENT,
      properties: {
        hosting: "self-hosted",
        version: pkg.version,
        database_dialect: config.databaseDialect,
        ...properties,
      },
    });
  }

  async shutdown(): Promise<void> {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
    await this.#events._shutdown();
    await this.#sdk?.shutdown();
  }

  #emit(
    level: LogLevel,
    sink: (message: string, context: LogContext) => void,
    message: string,
    context?: LogContext
  ): void {
    if (ORDER[level] < ORDER[this.#level]) return;
    sink(message, context ?? {});
    if (this.#sdk) {
      logs.getLogger("hermeum").emit({
        severityText: level,
        severityNumber: SEVERITY[level],
        body: message,
        attributes: (context ?? {}) as AnyValueMap,
      });
    }
  }
}

export const telemetry = new PostHogTelemetry({
  logLevel: config.logLevel,
  posthogApiKey: config.posthogApiKey,
  posthogHost: config.posthogHost,
  deploymentId: config.deploymentId,
  telemetryDisabled: config.telemetryDisabled,
});