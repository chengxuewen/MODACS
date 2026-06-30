/** MCAP multi-topic recorder — records topic bus data to MCAP format for Foxglove replay. */

import { McapWriter, type IWritable } from '@mcap/core';
import { mkdirSync, promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger, type Logger } from './logger.ts';
import type { TopicBus } from './topic-bus.ts';

const log: Logger = createLogger('recorder');

const encoder = new TextEncoder();
const MAX_QUEUE = 10_000;
const DISCOVERY_INTERVAL_MS = 1_000;

interface QueuedMessage {
  readonly topic: string;
  readonly timestamp: number;
  readonly data: unknown;
}

export interface Recorder {
  /** Manually record data for a topic. Primary recording is via TopicBus subscription. */
  record(topic: string, data: unknown): void;
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

export function createRecorder(dir: string, topicBus?: TopicBus): Recorder {
  mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = join(dir, `${stamp}.mcap`);

  let sequence = 0;
  let closed = false;
  let writer: McapWriter | null = null;
  let handle: FileHandle | null = null;
  const queue: QueuedMessage[] = [];
  let draining: Promise<void> = Promise.resolve();
  let initFailed = false;

  /** topic → channelId mapping for multi-channel MCAP recording. */
  const topicChannels = new Map<string, number>();
  /** Tracks subscribed topics to avoid duplicate subscriptions. */
  const subscribedTopics = new Set<string>();
  /** Unsubscribe functions for TopicBus subscriptions. */
  const unsubscribers: Array<() => void> = [];
  /** Discovery interval timer for polling new topics. */
  let discoveryTimer: ReturnType<typeof setInterval> | null = null;

  const initPromise = (async (): Promise<void> => {
    handle = await fs.open(filename, 'w');
    writer = new McapWriter({
      writable: new FileWritable(handle),
      useStatistics: true,
      useChunks: true,
      useChunkIndex: true,
    });
    await writer.start({ library: 'modacs', profile: '' });
    log.info('MCAP recording started', { filename });
  })().catch((err: unknown) => {
    initFailed = true;
    log.error('MCAP init failed, recording disabled', err);
  });

  /** Register a new MCAP channel for a topic (idempotent — returns existing if already registered). */
  async function ensureChannel(topic: string): Promise<number | null> {
    if (!writer || closed) return null;
    const existing = topicChannels.get(topic);
    if (existing !== undefined) return existing;

    const schemaId = await writer.registerSchema({
      name: `modacs.${topic.replace(/\//g, '.')}`,
      encoding: 'jsonschema',
      data: encoder.encode(JSON.stringify({ type: 'object' })),
    });
    const channelId = await writer.registerChannel({
      topic,
      schemaId,
      messageEncoding: 'json',
      metadata: new Map(),
    });
    topicChannels.set(topic, channelId);
    log.debug('Registered MCAP channel', { topic, channelId });
    return channelId;
  }

  async function drain(): Promise<void> {
    await initPromise;
    while (queue.length > 0 && writer && !closed) {
      const msg = queue.shift()!;
      const channelId = await ensureChannel(msg.topic);
      if (channelId === null) continue;
      await writer.addMessage({
        channelId,
        sequence: sequence++,
        logTime: BigInt(msg.timestamp),
        publishTime: BigInt(msg.timestamp),
        data: encoder.encode(JSON.stringify(msg.data)),
      });
    }
  }

  function enqueue(topic: string, data: unknown): void {
    if (closed || initFailed) return;
    if (queue.length >= MAX_QUEUE) {
      queue.shift();
      log.warn('Recorder queue full, dropping oldest message');
    }
    queue.push({ topic, timestamp: Date.now(), data });
    draining = draining.then(drain).catch((err: unknown) => {
      log.error('MCAP write failed', err);
    });
  }

  function record(topic: string, data: unknown): void {
    enqueue(topic, data);
  }

  // TopicBus integration: discover and subscribe to topics automatically
  if (topicBus) {
    function discoverTopics(): void {
      if (closed) return;
      const topics = topicBus!.getTopics();
      for (const { topic } of topics) {
        // Skip wildcard patterns — only subscribe to concrete topics
        if (topic.includes('*')) continue;
        if (!subscribedTopics.has(topic)) {
          subscribedTopics.add(topic);
          const unsub = topicBus!.subscribe(
            topic,
            (data: unknown) => enqueue(topic, data),
            `recorder:${topic}`,
          );
          unsubscribers.push(unsub);
          log.debug('Subscribed to topic', { topic });
        }
      }
    }

    discoveryTimer = setInterval(discoverTopics, DISCOVERY_INTERVAL_MS);
    discoverTopics();
  }

  async function close(): Promise<void> {
    closed = true;
    if (discoveryTimer !== null) {
      clearInterval(discoveryTimer);
      discoveryTimer = null;
    }
    for (const unsub of unsubscribers) {
      unsub();
    }
    unsubscribers.length = 0;
    await draining;
    try {
      await initPromise;
      if (writer) await writer.end();
    } finally {
      await handle?.close();
    }
    log.info('MCAP recording closed', { filename, messages: sequence, channels: topicChannels.size });
  }

  return { record, close };
}
