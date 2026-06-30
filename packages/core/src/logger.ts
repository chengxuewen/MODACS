/**
 * MODACS structured JSON logger.
 *
 * Zero external dependencies — uses console.log / console.error internally.
 * Each call writes exactly one JSON object line, safe for multi-process stdout.
 */
import type { TopicBus } from './topic-bus.ts';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  info(msg: string, ...meta: unknown[]): void;
  error(msg: string, err?: unknown): void;
  warn(msg: string, ...meta: unknown[]): void;
  debug(msg: string, ...meta: unknown[]): void;
}

function createLogger(name: string, topicBus?: TopicBus): Logger {
  const loggerName = name;

  function write(level: LogLevel, msg: string, ...args: unknown[]): void {
    const entry: Record<string, unknown> = {
      time: Date.now(),
      level,
      name: loggerName,
      msg,
    };

    if (args.length === 1 && args[0] !== undefined) {
      const arg = args[0];
      if (arg instanceof Error) {
        entry.err = { message: arg.message, name: arg.name, stack: arg.stack };
      } else if (arg !== null && typeof arg === 'object' && !Array.isArray(arg)) {
        Object.assign(entry, arg);
      } else {
        entry.meta = arg;
      }
    } else if (args.length > 1) {
      entry.meta = args;
    }

    const serialized = JSON.stringify(entry);
    if (level === 'error') {
      console.error(serialized);
    } else {
      console.log(serialized);
    }
    if (topicBus) {
      topicBus.publish(`/log/${loggerName}`, entry, { retainLast: true });
    }
  }

  return {
    info(msg: string, ...meta: unknown[]): void {
      write('info', msg, ...meta);
    },
    error(msg: string, err?: unknown): void {
      if (err !== undefined) {
        write('error', msg, err);
      } else {
        write('error', msg);
      }
    },
    warn(msg: string, ...meta: unknown[]): void {
      write('warn', msg, ...meta);
    },
    debug(msg: string, ...meta: unknown[]): void {
      write('debug', msg, ...meta);
    },
  };
}

export { Logger, createLogger };
