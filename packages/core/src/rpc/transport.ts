/** UDS JSON-RPC transport — HTTP server over Unix socket + undici client. */

import {
  createServer as httpCreateServer,
  type Server as HttpServer,
  type IncomingMessage,
} from 'node:http';
import { unlinkSync } from 'node:fs';
import { Client as UndiciClient } from 'undici';
import type { Logger } from '../logger.ts';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcError,
  serializeRequest,
  parseResponse,
  PARSE_ERROR,
  INVALID_REQUEST,
  INTERNAL_ERROR,
} from './protocol.ts';

export interface RpcServer {
  close(): void;
}

export interface RpcClient {
  call(method: string, params?: unknown[]): Promise<unknown>;
  close(): void;
}

export type RequestHandler = (request: JsonRpcRequest) => Promise<unknown>;

const RPC_TIMEOUT_MS = 2_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

function createServer(socketPath: string, onRequest: RequestHandler, logger: Logger): RpcServer {
  const server: HttpServer = httpCreateServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let raw: string;
    try { raw = await readBody(req); } catch { res.writeHead(400).end(); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      const e: JsonRpcError = { jsonrpc: '2.0', error: { code: PARSE_ERROR, message: 'Parse error' }, id: null };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(e));
      return;
    }
    const obj = parsed as Record<string, unknown>;
    if (obj?.jsonrpc !== '2.0' || typeof obj.method !== 'string') {
      const e: JsonRpcError = { jsonrpc: '2.0', error: { code: INVALID_REQUEST, message: 'Invalid Request' }, id: null };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(e));
      return;
    }
    const request = parsed as JsonRpcRequest;
    try {
      const result = await onRequest(request);
      const resp: JsonRpcResponse = { jsonrpc: '2.0', result, id: request.id };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(resp));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal error';
      const e: JsonRpcError = { jsonrpc: '2.0', error: { code: INTERNAL_ERROR, message: msg }, id: request.id };
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(e));
    }
  });

  try { unlinkSync(socketPath); } catch { /* stale socket */ }
  server.listen(socketPath);
  logger.info('RPC server listening', { socketPath });

  return {
    close(): void {
      server.close(() => {
        try { unlinkSync(socketPath); } catch { /* already removed */ }
        logger.info('RPC server closed', { socketPath });
      });
    },
  };
}

function createClient(socketPath: string, logger: Logger): RpcClient {
  let client = new UndiciClient('http://localhost', { socketPath });
  let backoffMs = INITIAL_BACKOFF_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function scheduleReconnect(): void {
    if (closed || reconnectTimer) return;
    logger.warn('Connection lost, reconnecting', { socketPath, backoffMs });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      client.destroy().catch(() => {});
      client = new UndiciClient('http://localhost', { socketPath });
      logger.info('RPC client reconnected', { socketPath });
    }, backoffMs);
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }

  async function call(method: string, params: unknown[] = []): Promise<unknown> {
    const body = serializeRequest(method, params, Date.now());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
      const { statusCode, body: respBody } = await client.request({
        method: 'POST',
        path: '/rpc',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal,
      });
      if (statusCode !== 200) throw new Error(`Unexpected HTTP status: ${statusCode}`);
      const raw = await respBody.text();
      const parsed = parseResponse(raw, logger);
      if ('error' in parsed) {
        throw Object.assign(new Error(parsed.error.message), { code: parsed.error.code });
      }
      backoffMs = INITIAL_BACKOFF_MS;
      return parsed.result;
    } catch (err) {
      if (!controller.signal.aborted) scheduleReconnect();
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function close(): void {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    client.close().catch(() => {});
    logger.info('RPC client closed', { socketPath });
  }

  return { call, close };
}

export { createServer, createClient };
