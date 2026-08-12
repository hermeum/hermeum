import { LogContext, LogLevel, LoggerAdaptor } from "../usecases/adaptors/logger";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class ConsoleLogger implements LoggerAdaptor {
  #level: LogLevel;

  constructor(level: LogLevel = "info") {
    this.#level = level;
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

  #emit(
    level: LogLevel,
    sink: (message: string, context: LogContext) => void,
    message: string,
    context?: LogContext
  ): void {
    if (ORDER[level] < ORDER[this.#level]) return;
    sink(message, context ?? {});
  }
}