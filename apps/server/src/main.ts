/**
 * MODACS Server — HTTP entry point.
 *
 * Hono server listening on port 3001.
 * Routes:
 *   POST /rpc/:method — dispatch JSON-RPC calls to base plugin via hub
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { mkdirSync, unlinkSync, existsSync, chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.ts';
import type { JsonRpcResponse } from '../../../packages/core/src/rpc/protocol.ts';
import type { JsonRpcError } from '../../../packages/core/src/rpc/protocol.ts';
import { serveStatic } from '@hono/node-server/serve-static';

const HTTP_PORT = 3001;

// Socket directory — ensure it exists and clean stale sockets
const SOCKET_DIR = '/tmp/modacs';
mkdirSync(SOCKET_DIR, { recursive: true });
chmodSync(SOCKET_DIR, 0o700);

const staleSockets = ['base.sock'];
for (const name of staleSockets) {
  const sockPath = `${SOCKET_DIR}/${name}`;
  if (existsSync(sockPath)) {
    unlinkSync(sockPath);
  }
}

const { hub, recorder, bridge, topicBus, processManager, close } = await createApp();

const app = new Hono();

app.post('/rpc/:method', async (c) => {
  try {
    const method = c.req.param('method');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null });
    }

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
  } catch (err) {
    return c.json({
      jsonrpc: '2.0',
      error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
      id: null,
    }, 500);
  }
});

// GET /api/topics:list — return all active topic metadata
app.get('/api/topics:list', (c) => {
  try {
    const topics = topicBus.getTopics();
    return c.json({ data: topics, error: null });
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// GET /api/topics:stats
app.get('/api/topics:stats', (c) => {
  try {
    const topics = topicBus.getTopics();
    const stats = topics.map(t => ({ ...t, lastMessage: topicBus.getLastMessage(t.topic) }));
    return c.json({ data: stats, error: null });
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// GET /api/processes:list
app.get('/api/processes:list', (c) => {
  try {
    const plugins = hub.getPlugins();
    return c.json({ data: plugins, error: null });
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// GET /api/recordings:list
app.get('/api/recordings:list', (c) => {
  try {
    const recordings = recorder.listRecordings();
    return c.json({ data: recordings, error: null });
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// GET /api/logs:list
app.get('/api/logs:list', (c) => {
  try {
    const allTopics = topicBus.getTopics();
    const logTopics = allTopics.filter(t => t.topic.startsWith('/log/'));
    const logs = logTopics.map(t => ({ topic: t.topic, lastMessage: topicBus.getLastMessage(t.topic) }));
    return c.json({ data: logs, error: null });
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// GET /api/bridge:status
app.get('/api/bridge:status', (c) => {
  try {
    const status = bridge.getStatus();
    return c.json({ data: status, error: null });
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// POST /api/topics:publish
app.post('/api/topics:publish', async (c) => {
  try {
    const body = await c.req.json();
    const { topic, payload } = body as { topic: string; payload: unknown };
    if (!topic || typeof topic !== 'string') {
      return c.json({ data: null, error: 'Missing or invalid topic' }, 400);
    }
    topicBus.publish(topic, payload);
    return c.json({ data: { success: true }, error: null });
  } catch (err) {
    return c.json({ data: null, error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

// GET /api/logs:stream — SSE endpoint
app.get('/api/logs:stream', (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const unsub = topicBus.subscribe('/log/*', (data: unknown) => {
        try {
          const entry = data as Record<string, unknown>;
          controller.enqueue(`data: ${JSON.stringify(entry)}\n\n`);
        } catch {
          // ignore serialization or stream-closed errors
        }
      });
      const heartbeat = setInterval(() => {
        try { controller.enqueue(': keepalive\n\n') } catch { /* closed */ }
      }, 30000);
      if (c.req.raw.signal) {
        c.req.raw.signal.addEventListener('abort', () => {
          unsub();
          clearInterval(heartbeat);
          try { controller.close() } catch { /* already closed */ }
        });
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// Serve debug SPA from built assets
app.use('/debug/*', serveStatic({
  root: './apps/debug/dist',
  rewriteRequestPath: (path) => path.replace(/^\/debug/, ''),
}));
app.get('/debug', (c) => c.redirect('/debug/index.html'));

// SPA fallback: serve index.html for client-side routes under /debug/*
app.get('/debug/*', (c) => {
  try {
    const html = readFileSync(join('./apps/debug/dist', 'index.html'), 'utf-8')
    return c.html(html)
  } catch {
    return c.text('Debug app not built. Run: pnpm --filter debug build', 404)
  }
});

app.use('/*', serveStatic({ root: './apps/server/public' }));

// Global error handler for all route errors
app.onError((err, c) => {
  console.error('Route error:', err);
  return c.json({ data: null, error: err instanceof Error ? err.message : 'Internal server error' }, 500);
});
const server = serve({ fetch: app.fetch, port: HTTP_PORT });

// Process-level error handlers — last resort for uncaught errors
process.on('uncaughtException', async (err) => {
  console.error('Uncaught exception:', err);
  try {
    await close();
    server.close();
  } catch (e) {
    // ignore close errors during crash
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// Graceful shutdown — close hub, recorder, bridge, kill children
process.on('SIGTERM', async () => {
  await close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await close();
  server.close();
  process.exit(0);
});