/**
 * Foxglove Bridge — optional WebSocket server for real-time debugging.
 *
 * Implements the standard Foxglove WebSocket protocol so Foxglove Studio
 * can connect, discover topics, and subscribe to live data.
 *
 * Only active when MODACS_DEBUG=1. When disabled, returns a no-op bridge
 * so callers can always invoke broadcast() / close() without conditional checks.
 */

import { createLogger } from './logger.ts';
import type { TopicBus } from './topic-bus.ts';
import { WebSocketServer, WebSocket } from 'ws';

const logger = createLogger('foxglove-bridge');

const DEFAULT_PORT = 8765;
const MAX_RETRIES = 5;
const MAX_CLIENTS = 5;
const POLL_INTERVAL_MS = 1000;

interface FoxgloveBridge {
  broadcast(method: string, params: unknown[], result: unknown): void;
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

  let server: WebSocketServer | null = null;
  let attempt = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Topic → channel ID mapping
  const topicToChannel = new Map<string, number>();
  const channelToTopic = new Map<number, string>();
  let nextChannelId = 1;

  // Per-client subscriptions: WebSocket → Set<channelId>
  const clientSubs = new Map<WebSocket, Set<number>>();
  // Per-topic TopicBus unsubscribe functions
  const topicUnsubs = new Map<string, () => void>();

  function send(ws: WebSocket, obj: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function broadcast(obj: unknown): void {
    if (!server) return;
    const msg = JSON.stringify(obj);
    for (const client of server.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  function sendAdvertise(topic: string, channelId: number): void {
    broadcast({
      op: 'advertise',
      channels: [{ id: channelId, topic, encoding: 'json', schemaName: 'JSON' }],
    });
  }

  function subscribeToTopic(topic: string): void {
    if (topicUnsubs.has(topic)) return;
    const unsub = bus.subscribe(topic, (data: unknown) => {
      const channelId = topicToChannel.get(topic);
      if (channelId === undefined) return;
      const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
      const timestamp = (BigInt(Date.now()) * 1_000_000n).toString();
      const msg = JSON.stringify({ op: 'message', channelId, timestamp, data: encoded });
      for (const [client, subs] of clientSubs) {
        if (client.readyState === WebSocket.OPEN && subs.has(channelId)) {
          client.send(msg);
        }
      }
    }, `foxglove-${topic}`);
    topicUnsubs.set(topic, unsub);
  }

  function getOrCreateChannel(topic: string): void {
    if (topicToChannel.has(topic)) return;
    const id = nextChannelId++;
    topicToChannel.set(topic, id);
    channelToTopic.set(id, topic);
    sendAdvertise(topic, id);
    subscribeToTopic(topic);
  }

  function pollTopics(): void {
    for (const { topic } of bus.getTopics()) {
      getOrCreateChannel(topic);
    }
  }

  function handleClientMessage(ws: WebSocket, raw: string): void {
    let msg: { op?: string; subscriptions?: { channelId: number }[] };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.op === 'subscribe') {
      const subs = clientSubs.get(ws) ?? new Set<number>();
      for (const s of msg.subscriptions ?? []) {
        subs.add(s.channelId);
      }
      clientSubs.set(ws, subs);
    } else if (msg.op === 'unsubscribe') {
      const subs = clientSubs.get(ws);
      if (subs) {
        for (const s of msg.subscriptions ?? []) {
          subs.delete(s.channelId);
        }
      }
    }
  }

  function tryStart(): void {
    const tryPort = port + attempt;
    const wss = new WebSocketServer({ port: tryPort, host: '127.0.0.1' });

    wss.on('listening', () => {
      server = wss;
      logger.info('Foxglove bridge listening', { port: tryPort });
      pollTopics();
      pollTimer = setInterval(pollTopics, POLL_INTERVAL_MS);

      wss.on('connection', (ws: WebSocket) => {
        if (wss.clients.size > MAX_CLIENTS) {
          ws.close(1013, 'Too many connections');
          return;
        }
        clientSubs.set(ws, new Set<number>());
        logger.debug('Foxglove client connected');

        send(ws, {
          op: 'serverInfo',
          name: 'MODACS',
          capabilities: ['publishing'],
          supportedEncodings: ['json'],
        });

        for (const [topic, id] of topicToChannel) {
          send(ws, {
            op: 'advertise',
            channels: [{ id, topic, encoding: 'json', schemaName: 'JSON' }],
          });
        }

        ws.on('message', (data: unknown) => handleClientMessage(ws, String(data)));
        ws.on('close', () => {
          clientSubs.delete(ws);
          logger.debug('Foxglove client disconnected');
        });
      });
    });

    wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && attempt < MAX_RETRIES) {
        wss.close();
        attempt++;
        tryStart();
      } else {
        wss.close();
        logger.warn('Foxglove bridge disabled', { err: err.message });
      }
    });
  }

  tryStart();

  return {
    broadcast(): void {
      // No-op — Foxglove protocol uses topic-based messaging via TopicBus
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
      server?.close();
    },
  };
}

export { FoxgloveBridge, createBridge };
