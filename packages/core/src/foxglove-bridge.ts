/**
 * Foxglove Bridge — optional WebSocket server for real-time debugging.
 *
 * Uses the official @foxglove/ws-protocol package so Foxglove Studio
 * can connect, discover topics, and subscribe to live data.
 *
 * Only active when MODACS_DEBUG=1. When disabled, returns a no-op bridge
 * so callers can always invoke broadcast() / close() without conditional checks.
 */

import { createLogger } from './logger.ts';
import type { TopicBus } from './topic-bus.ts';
import { FoxgloveServer } from '@foxglove/ws-protocol';
import type { IWebSocket } from '@foxglove/ws-protocol';
import { WebSocketServer } from 'ws';

const logger = createLogger('foxglove-bridge');

const DEFAULT_PORT = 8765;
const MAX_RETRIES = 5;
const MAX_CLIENTS = 5;
const POLL_INTERVAL_MS = 1000;

interface FoxgloveBridge {
  broadcast(): void;
  close(): void;
}

function createNoopBridge(): FoxgloveBridge {
  return { broadcast: () => {}, close: () => {} };
}

function createBridge(topicBus?: TopicBus, port: number = DEFAULT_PORT): FoxgloveBridge {
  if (process.env.MODACS_DEBUG !== '1' || !topicBus) {
    return createNoopBridge();
  }

  const bus = topicBus;

  const server = new FoxgloveServer({
    name: 'MODACS',
    capabilities: ['publishing'],
    supportedEncodings: ['json'],
  });

  // Topic → channel ID mapping (populated as topics are discovered)
  const topicToChannel = new Map<string, number>();
  const channelToTopic = new Map<number, string>();

  // Active TopicBus subscriptions (lazy: only subscribed when Foxglove clients are listening)
  const topicUnsubs = new Map<string, () => void>();

  let wss: WebSocketServer | null = null;
  let attempt = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function ensureTopicSubscribed(topic: string): void {
    if (topicUnsubs.has(topic)) return;

    const channelId = topicToChannel.get(topic);
    if (channelId === undefined) return;

    const encoder = new TextEncoder();

    const unsub = bus.subscribe(topic, (data: unknown) => {
      let payload: unknown = data;
      // Transform log entries to foxglove.Log format for Log panel compatibility
      if (topic.startsWith('/log/') && typeof data === 'object' && data !== null) {
        const d = data as Record<string, unknown>;
        const time = (d.time as number) ?? Date.now();
        const sec = Math.floor(time / 1000);
        const nsec = (time % 1000) * 1_000_000;
        payload = {
          timestamp: { sec, nsec },
          level: { error: 8, warn: 4, info: 2, debug: 1 }[String(d.level)] ?? 2,
          name: d.name ?? '',
          msg: d.msg ?? '',
          file: d.file ?? '',
          function: d.function ?? '',
          line: (d.line as number) ?? 0,
        };
      }
      server.sendMessage(
        channelId,
        BigInt(Date.now()) * 1_000_000n,
        encoder.encode(JSON.stringify(payload)),
      );
    }, `foxglove-${topic}`);

    topicUnsubs.set(topic, unsub);
  }

  function ensureTopicUnsubscribed(topic: string): void {
    const unsub = topicUnsubs.get(topic);
    if (unsub) {
      unsub();
      topicUnsubs.delete(topic);
    }
  }

  function ensureChannel(topic: string): void {
    if (topicToChannel.has(topic)) return;

    const isLogTopic = topic.startsWith('/log/');
    const chanId = server.addChannel({
      topic,
      encoding: 'json',
      schemaName: isLogTopic ? 'foxglove.Log' : 'JSON',
      schema: isLogTopic ? '{"type":"object","properties":{"timestamp":{"type":"object","properties":{"sec":{"type":"integer"},"nsec":{"type":"integer"}}},"level":{"type":"integer"},"name":{"type":"string"},"msg":{"type":"string"},"file":{"type":"string"},"function":{"type":"string"},"line":{"type":"integer"}}}' : JSON.stringify({ type: 'object' }),
    });

    topicToChannel.set(topic, chanId);
    channelToTopic.set(chanId, topic);

    logger.debug('Channel advertised', { topic, chanId });
    // TopicBus subscription deferred until Foxglove client connects
    // (retained messages must reach CONNECTED clients, not empty server)
  }

  function pollTopics(): void {
    for (const { topic } of bus.getTopics()) {
      ensureChannel(topic);
    }
  }

  // Lazy TopicBus subscription: start forwarding when first Foxglove client subscribes
  server.on('subscribe', (chanId: number) => {
    const topic = channelToTopic.get(chanId);
    if (topic) {
      ensureTopicSubscribed(topic);
    }
  });

  // Stop forwarding when last Foxglove client unsubscribes
  server.on('unsubscribe', (chanId: number) => {
    const topic = channelToTopic.get(chanId);
    if (topic) {
      ensureTopicUnsubscribed(topic);
    }
  });

  server.on('error', (err: Error) => {
    logger.error('Foxglove server error', err);
  });

  function tryStart(): void {
    const tryPort = port + attempt;
    const ws = new WebSocketServer({
      port: tryPort,
      host: '127.0.0.1',
      handleProtocols: (protocols) => server.handleProtocols(protocols),
    });

    ws.on('listening', () => {
      wss = ws;
      logger.info('Foxglove bridge listening', { port: tryPort });

      pollTopics();
      pollTimer = setInterval(pollTopics, POLL_INTERVAL_MS);
    });

    ws.on('connection', (conn, req) => {
      if (ws.clients.size > MAX_CLIENTS) {
        conn.close(1013, 'Too many connections');
        return;
      }

      const name = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      server.handleConnection(conn as unknown as IWebSocket, name);
      logger.debug('Foxglove client connected');

      // Subscribe to all TopicBus topics NOW (client is connected)
      // TopicBus replays retained messages → they reach the Foxglove client
      for (const topic of topicToChannel.keys()) {
        ensureTopicSubscribed(topic);
      }
    });

    ws.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_RETRIES) {
        ws.close();
        attempt++;
        tryStart();
      } else {
        ws.close();
        logger.warn('Foxglove bridge disabled', { err: err.message });
      }
    });
  }

  tryStart();

  return {
    broadcast(): void {
      // No-op — message delivery is handled by FoxgloveServer via TopicBus subscriptions.
    },
    close(): void {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      for (const unsub of topicUnsubs.values()) {
        unsub();
      }
      topicUnsubs.clear();
      wss?.close();
    },
  };
}

export { FoxgloveBridge, createBridge };
