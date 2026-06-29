/** MCAP passthrough recorder — records RPC calls to MCAP format for Foxglove replay. */

import { McapWriter, type IWritable } from '@mcap/core';
import { mkdirSync, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger, type Logger } from './logger.ts';

const log: Logger = createLogger('recorder');

const RPC_TOPIC = '/rpc';
const RPC_SCHEMA_NAME = 'modacs.RpcEvent';
const RPC_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    timestamp: { type: 'number', description: 'Unix epoch milliseconds' },
    method: { type: 'string' },
    params: { type: 'array' },
    result: {},
  },
  required: ['timestamp', 'method', 'params', 'result'],
});

const encoder = new TextEncoder();

interface QueuedEvent {
  readonly timestamp: number;
  readonly method: string;
  readonly params: unknown[];
  readonly result: unknown;
}

export interface Recorder {
  record(method: string, params: unknown[], result: unknown): void;
  close(): Promise<void>;
}

/** IWritable adapter for Node.js FileHandle — required by McapWriter. */
class FileWritable implements IWritable {
  private offset = 0n;

  constructor(private readonly handle: FileHandle) {}

  async write(buffer: Uint8Array): Promise<void> {
    const { bytesWritten } = await this.handle.write(buffer);
    this.offset += BigInt(bytesWritten);
  }

  position(): bigint {
    return this.offset;
  }
}

export function createRecorder(dir: string): Recorder {
  mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = join(dir, `${stamp}.mcap`);

  let sequence = 0;
  let closed = false;
  let channelId = 0;
  let writer: McapWriter | null = null;
  let handle: FileHandle | null = null;
  const queue: QueuedEvent[] = [];
  let draining: Promise<void> = Promise.resolve();

  const initPromise = (async (): Promise<void> => {
    handle = await fs.open(filename, 'w');
    writer = new McapWriter({
      writable: new FileWritable(handle),
      useStatistics: true,
      useChunks: true,
      useChunkIndex: true,
    });
    await writer.start({ library: 'modacs', profile: '' });
    const schemaId = await writer.registerSchema({
      name: RPC_SCHEMA_NAME,
      encoding: 'jsonschema',
      data: encoder.encode(RPC_SCHEMA),
    });
    channelId = await writer.registerChannel({
      topic: RPC_TOPIC,
      schemaId,
      messageEncoding: 'json',
      metadata: new Map(),
    });
    log.info('MCAP recording started', { filename });
  })();

  async function drain(): Promise<void> {
    await initPromise;
    while (queue.length > 0 && writer && !closed) {
      const event = queue.shift()!;
      await writer.addMessage({
        channelId,
        sequence: sequence++,
        logTime: BigInt(event.timestamp),
        publishTime: BigInt(event.timestamp),
        data: encoder.encode(JSON.stringify(event)),
      });
    }
  }

  function record(method: string, params: unknown[], result: unknown): void {
    if (closed) return;
    queue.push({ timestamp: Date.now(), method, params, result });
    draining = draining.then(drain).catch((err: unknown) => {
      log.error('MCAP write failed', err);
    });
  }

  async function close(): Promise<void> {
    closed = true;
    await draining;
    await initPromise;
    if (writer) await writer.end();
    await handle?.close();
    log.info('MCAP recording closed', { filename, messages: sequence });
  }

  return { record, close };
}
