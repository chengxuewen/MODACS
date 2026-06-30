/**
 * Foxglove Bridge — optional WebSocket server for real-time debugging.
 *
 * Only active when MODACS_DEBUG=1. When disabled, returns a no-op bridge
 * so callers can always invoke broadcast() / close() without conditional checks.
 */

import { createLogger } from './logger.ts';
import { WebSocketServer, WebSocket } from 'ws';

const logger = createLogger('foxglove-bridge');

const DEFAULT_PORT = 8765;
const MAX_RETRIES = 5;
const MAX_CLIENTS = 5;

interface FoxgloveBridge {
  broadcast(method: string, params: unknown[], result: unknown): void;
  close(): void;
}

interface RpcEvent {
  type: 'rpc';
  method: string;
  params: unknown[];
  result: unknown;
  timestamp: number;
}

function createNoopBridge(): FoxgloveBridge {
  return { broadcast: () => {}, close: () => {} };
}

function createBridge(port: number = DEFAULT_PORT): FoxgloveBridge {
  if (process.env.MODACS_DEBUG !== '1') {
    return createNoopBridge();
  }

  let server: WebSocketServer | null = null;
  let attempt = 0;

  function tryStart(): void {
    const tryPort = port + attempt;
    const wss = new WebSocketServer({ port: tryPort, host: '127.0.0.1' });

    wss.on('listening', () => {
      server = wss;
      logger.info('Foxglove bridge listening', { port: tryPort });
      wss.on('connection', (ws: WebSocket) => {
        if (wss.clients.size > MAX_CLIENTS) {
          ws.close(1013, 'Too many connections');
          return;
        }
        logger.debug('Foxglove client connected');
        ws.on('close', () => logger.debug('Foxglove client disconnected'));
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
    broadcast(method: string, params: unknown[], result: unknown): void {
      if (!server) return;
      const event: RpcEvent = { type: 'rpc', method, params, result, timestamp: Date.now() };
      const message = JSON.stringify(event);
      for (const client of server.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    },
    close(): void {
      server?.close();
    },
  };
}

export { FoxgloveBridge, createBridge };
