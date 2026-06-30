/**
 * MODACS Server — HTTP entry point.
 *
 * Hono server listening on port 3001.
 * Routes:
 *   POST /rpc/:method — dispatch JSON-RPC calls to base plugin via hub
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { createApp } from './app.ts';
import type { JsonRpcResponse } from '../../../packages/core/src/rpc/protocol.ts';
import type { JsonRpcError } from '../../../packages/core/src/rpc/protocol.ts';
import { serveStatic } from '@hono/node-server/serve-static';

// Socket directory — ensure it exists and clean stale sockets
const SOCKET_DIR = '/tmp/modacs';
mkdirSync(SOCKET_DIR, { recursive: true });

const staleSockets = ['base.sock'];
for (const name of staleSockets) {
  const sockPath = `${SOCKET_DIR}/${name}`;
  if (existsSync(sockPath)) {
    unlinkSync(sockPath);
  }
}

const { hub, close } = await createApp();

const app = new Hono();

app.post('/rpc/:method', async (c) => {
  const method = c.req.param('method');
  const body: unknown = await c.req.json();

  // Extract params from JSON-RPC request body
  let params: unknown[] = [];
  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.params)) {
      params = obj.params;
    }
  }

  const result: JsonRpcResponse | JsonRpcError = await hub.call('base', method, params);
  return c.json(result);
});

// GET /api/topics:list — return all active topic metadata
app.get('/api/topics:list', (c) => {
  const topics = hub.topicBus.getTopics();
  return c.json(topics);
});

// Serve static debug page
app.use('/*', serveStatic({ root: './apps/server/public' }));

// Graceful shutdown — close hub, recorder, bridge, kill children
process.on('SIGTERM', async () => {
  await close();
  process.exit(0);
});

serve({ fetch: app.fetch, port: 3001 });