/**
 * RPC Hub — central routing for plugin JSON-RPC calls via UDS.
 *
 * Registers plugin socket paths, proxies calls to the target plugin,
 * supports fan-out broadcast, and exposes recording hooks.
 */

import { createLogger } from '../logger.ts';
import {
  serializeRequest,
  parseResponse,
  createError,
  METHOD_NOT_FOUND,
  INTERNAL_ERROR,
  type JsonRpcResponse,
  type JsonRpcError,
} from './protocol.ts';
import { createClient, type RpcClient } from './transport.ts';

/** Called BEFORE dispatching an RPC — receives plugin, method, params. */
type CallHook = (plugin: string, method: string, params: unknown[]) => void;

/** Called AFTER receiving a response — receives plugin, method, result. */
type ResultHook = (plugin: string, method: string, result: JsonRpcResponse | JsonRpcError) => void;

/** Central RPC router for plugin communication. */
interface Hub {
  registerPlugin(name: string, socketPath: string): void;
  call(plugin: string, method: string, params: unknown[]): Promise<JsonRpcResponse | JsonRpcError>;
  broadcast(method: string, params: unknown[]): Promise<(JsonRpcResponse | JsonRpcError)[]>;
  onCall(callback: CallHook): void;
  onResult(callback: ResultHook): void;
}

function createHub(): Hub {
  const logger = createLogger('rpc-hub');
  const plugins = new Map<string, string>();
  const clients = new Map<string, RpcClient>();
  const callHooks: CallHook[] = [];
  const resultHooks: ResultHook[] = [];

  function getOrCreateClient(name: string): RpcClient {
    let client = clients.get(name);
    if (client) return client;
    const socketPath = plugins.get(name)!;
    client = createClient(socketPath, logger);
    clients.set(name, client);
    return client;
  }

  async function call(
    plugin: string,
    method: string,
    params: unknown[],
  ): Promise<JsonRpcResponse | JsonRpcError> {
    for (const cb of callHooks) cb(plugin, method, params);

    if (!plugins.has(plugin)) {
      const err = createError(METHOD_NOT_FOUND, `Plugin not registered: ${plugin}`);
      for (const cb of resultHooks) cb(plugin, method, err);
      return err;
    }

    try {
      const client = getOrCreateClient(plugin);
      logger.debug('RPC dispatch', { plugin, method, req: serializeRequest(method, params) });
      const result = await client.call(method, params);
      // Construct and validate JSON-RPC response envelope
      const raw = JSON.stringify({ jsonrpc: '2.0' as const, result, id: Date.now() });
      const response = parseResponse(raw, logger);
      for (const cb of resultHooks) cb(plugin, method, response);
      return response;
    } catch (e) {
      const code = (e as { code?: number })?.code ?? INTERNAL_ERROR;
      const message = e instanceof Error ? e.message : 'Unknown RPC error';
      const err = createError(code, message);
      for (const cb of resultHooks) cb(plugin, method, err);
      return err;
    }
  }

  async function broadcast(
    method: string,
    params: unknown[],
  ): Promise<(JsonRpcResponse | JsonRpcError)[]> {
    const names = [...plugins.keys()];
    const settled = await Promise.allSettled(names.map((n) => call(n, method, params)));
    return settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
      return createError(INTERNAL_ERROR, `Broadcast to ${names[i]} failed: ${msg}`);
    });
  }

  function registerPlugin(name: string, socketPath: string): void {
    plugins.set(name, socketPath);
    logger.info('Plugin registered', { name, socketPath });
  }

  function onCall(callback: CallHook): void {
    callHooks.push(callback);
  }

  function onResult(callback: ResultHook): void {
    resultHooks.push(callback);
  }

  return { registerPlugin, call, broadcast, onCall, onResult };
}

export { createHub, type Hub, type CallHook, type ResultHook };
