/** MODACS child process lifecycle manager — fork + exponential backoff restart. */

import { fork, type ChildProcess } from 'node:child_process';
import { createLogger, type Logger } from './logger.ts';
const SIGKILL_GRACE_MS = 5_000;
const STABLE_WINDOW_MS = 60_000;
const MAX_RESTARTS = 3;
const INITIAL_RESTART_DELAY_MS = 1_000;
const MAX_RESTART_DELAY_MS = 30_000;

const log: Logger = createLogger('process-manager');

type ExitCallback = (code: number | null, signal: string | null) => void;

export interface ManagedProcess {
  readonly pid: number;
  onExit(cb: ExitCallback): void;
  kill(signal?: NodeJS.Signals): void;
}

export interface ProcessInfo {
  name: string;
  pid: number | null;
  status: 'running' | 'stopped' | 'restarting';
  uptime: number;
  restartCount: number;
}

interface ProcessRecord {
  scriptPath: string;
  env?: Record<string, string>;
  restartCount: number;
  startTime: number;
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
  }, SIGKILL_GRACE_MS);
}

export function spawn(scriptPath: string, env?: Record<string, string>): ManagedProcess {
  const record: ProcessRecord = { scriptPath, env, restartCount: 0, startTime: Date.now(), killed: false, exitCallbacks: [] };
  const mergedEnv = env ? { ...process.env, ...env } : undefined;
  const forkOptions = mergedEnv ? { env: mergedEnv } : undefined;
  let currentPid = 0;
  let stableTimer: NodeJS.Timeout | undefined;

  function doRespawn(newChild: ChildProcess): void {
    currentPid = newChild.pid!;
    records.set(currentPid, record);
    record.startTime = Date.now();
    children.set(currentPid, newChild);
    newChild.on('exit', handleExit);
    if (stableTimer) clearTimeout(stableTimer);
    stableTimer = setTimeout(() => { record.restartCount = 0; }, STABLE_WINDOW_MS);
  }

  function handleExit(code: number | null, signal: string | null): void {
    for (const cb of record.exitCallbacks) cb(code, signal);
    records.delete(currentPid);
    children.delete(currentPid);
    if (record.killed) return;
    if (record.restartCount >= MAX_RESTARTS) {
      log.error(`Process ${scriptPath} exceeded max restarts, disabling`);
      record.killed = true;
      return;
    }
    scheduleRestart();
  }

  function scheduleRestart(): void {
    const delay = Math.min(INITIAL_RESTART_DELAY_MS * Math.pow(2, record.restartCount), MAX_RESTART_DELAY_MS);
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

export function getProcessList(): ProcessInfo[] {
  const results: ProcessInfo[] = [];
  for (const [pid, record] of records) {
    const child = children.get(pid);
    const now = Date.now();
    results.push({
      name: record.scriptPath,
      pid: child?.pid ?? null,
      status: child && child.exitCode === null ? 'running' : 'stopped',
      uptime: Math.floor((now - record.startTime) / 1000),
      restartCount: record.restartCount,
    });
  }
  return results;
}
