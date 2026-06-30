/** MODACS child process lifecycle manager — fork + exponential backoff restart. */

import { fork, type ChildProcess } from 'node:child_process';
import { createLogger, type Logger } from './logger.ts';

const log: Logger = createLogger('process-manager');

type ExitCallback = (code: number | null, signal: string | null) => void;

export interface ManagedProcess {
  readonly pid: number;
  onExit(cb: ExitCallback): void;
  kill(signal?: NodeJS.Signals): void;
}

interface ProcessRecord {
  scriptPath: string;
  env?: Record<string, string>;
  restartCount: number;
  killed: boolean;
  exitCallbacks: ExitCallback[];
}

const records = new Map<number, ProcessRecord>();
const children = new Map<number, ChildProcess>();
let isShuttingDown = false;

export function killAllChildren(): void {
  isShuttingDown = true;
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => {
    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
  }, 5000);
}

export function spawn(scriptPath: string, env?: Record<string, string>): ManagedProcess {
  const record: ProcessRecord = { scriptPath, env, restartCount: 0, killed: false, exitCallbacks: [] };
  const mergedEnv = env ? { ...process.env, ...env } : undefined;
  const forkOptions = mergedEnv ? { env: mergedEnv } : undefined;
  let currentPid = 0;
  let stableTimer: NodeJS.Timeout | undefined;

  function doRespawn(newChild: ChildProcess): void {
    currentPid = newChild.pid!;
    records.set(currentPid, record);
    children.set(currentPid, newChild);
    newChild.on('exit', handleExit);
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = setTimeout(() => { record.restartCount = 0; }, 60000);
  }

  function handleExit(code: number | null, signal: string | null): void {
    for (const cb of record.exitCallbacks) cb(code, signal);
    records.delete(currentPid);
    children.delete(currentPid);
    if (record.killed) return;
    if (record.restartCount >= 3) {
      log.error(`Process ${scriptPath} exceeded max restarts, disabling`);
      record.killed = true;
      return;
    }
    scheduleRestart();
  }

  function scheduleRestart(): void {
    const delay = Math.min(1000 * Math.pow(2, record.restartCount), 30000);
    log.warn(`Process ${scriptPath} exited, restart in ${delay}ms (attempt ${record.restartCount + 1})`);
    record.restartCount++;
    setTimeout(() => {
      if (isShuttingDown) return;
      doRespawn(fork(scriptPath, forkOptions));
    }, delay);
  }

  doRespawn(fork(scriptPath, forkOptions));

  return {
    get pid(): number { return currentPid; },
    onExit(cb: ExitCallback): void { record.exitCallbacks.push(cb); },
    kill(signal?: NodeJS.Signals): void {
      record.killed = true;
      children.get(currentPid)?.kill(signal ?? 'SIGTERM');
    },
  };
}
