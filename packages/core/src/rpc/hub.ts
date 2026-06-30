/**
 * RPC Hub — central routing for plugin JSON-RPC calls via UDS.
 *
 * Registers plugin socket paths, proxies calls to the target plugin,
 * supports fan-out broadcast, and exposes recording hooks.
 */

import { createLogger } from '../logger.ts';
import {
  createError,
  METHOD_NOT_FOUND,
  INTERNAL_ERROR,
  type JsonRpcResponse,
  type JsonRpcError,
} from './protocol.ts';
import { createClient, type RpcClient } from './transport.ts';
import { createTopicBus, type TopicBus } from '../topic-bus.ts';
import { topicForRpc } from '../topic-types.ts';

/** Called BEFORE dispatching an RPC — receives plugin, method, params. */
type CallHook = (plugin: string, method: string, params: unknown[]) => void;

/** Called AFTER receiving a response — receives plugin, method, result. */
type ResultHook = (plugin: string, method: string, result: JsonRpcResponse | JsonRpcError) => void;

/** Central RPC router for plugin communication. */
interface Hub {
  registerPlugin(name: string, socketPath: string): void;
  unregisterPlugin(name: string): void;
  call(plugin: string, method: string, params: unknown[]): Promise<JsonRpcResponse | JsonRpcError>;
  broadcast(method: string, params: unknown[]): Promise<(JsonRpcResponse | JsonRpcError)[]>;
  onCall(callback: CallHook): void;
  onResult(callback: ResultHook): void;
  topicBus: TopicBus;
  /**
   * Subscribe a plugin to a topic. When the topic fires, hub sends a
   * `topic:event` JSON-RPC notification to the plugin via UDS.
   * Returns an unsubscribe function.
   */
  subscribeForPlugin(pluginName: string, topic: string): () => void;
}

function createHub(): Hub {
  const logger = createLogger('rpc-hub');
  const plugins = new Map<string, string>();
  const clients = new Map<string, RpcClient>();
  const callHooks: CallHook[] = [];
  const resultHooks: ResultHook[] = [];

  const topicBus = createTopicBus();

  /** Publish to the topic bus without letting topic errors break RPC flow. */
  function safePublish(topic: string, data: unknown): void {
    try {
      topicBus.publish(topic, data);
    } catch (err) {
      logger.debug('topic publish failed', err);
    }
  }

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
    safePublish(topicForRpc(method), { plugin, method, params });

    try {
      const client = getOrCreateClient(plugin);
      logger.debug('RPC dispatch', { plugin, method, paramCount: params.length });
      const result = await client.call(method, params);
      // Construct and validate JSON-RPC response envelope
      const response: JsonRpcResponse = { jsonrpc: '2.0', result, id: Date.now() };
      for (const cb of resultHooks) cb(plugin, method, response);
      safePublish(`${topicForRpc(method)}/result`, { plugin, method, result: response });
      return response;
    } catch (e) {
      const code = (e as { code?: number })?.code ?? INTERNAL_ERROR;
      const message = e instanceof Error ? e.message : 'Unknown RPC error';
      const err = createError(code, message);
      for (const cb of resultHooks) cb(plugin, method, err);
      safePublish(`${topicForRpc(method)}/result`, { plugin, method, result: err });
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

  function unregisterPlugin(name: string): void {
    // Clean up topic subscriptions
    const unsubs = pluginUnsubs.get(name);
    if (unsubs) {
      for (const unsub of unsubs) {
        try { unsub(); } catch { logger.debug('plugin unregister cleanup failed', { name }); }
      }
      pluginUnsubs.delete(name);
    }

    const client = clients.get(name);
    if (client) {
      client.close();
      clients.delete(name);
    }
    plugins.delete(name);
    logger.info('Plugin unregistered', { name });
  }

  function onCall(callback: CallHook): void {
    callHooks.push(callback);
  }

  function onResult(callback: ResultHook): void {
    resultHooks.push(callback);
  }

  /** Track unsubscribe functions per plugin for cleanup. */
  const pluginUnsubs = new Map<string, Array<() => void>>();

  function subscribeForPlugin(pluginName: string, topic: string): () => void {
    if (!plugins.has(pluginName)) {
      logger.warn('subscribeForPlugin: plugin not registered', { pluginName, topic });
      return () => {};
    }

    const unsub = topicBus.subscribe(
      topic,
      (data: unknown) => {
        const client = getOrCreateClient(pluginName);
        client.call('topic:event', [topic, data]).catch((err: unknown) => {
          logger.debug('topic:event notification failed', { pluginName, topic, err });
        });
      },
      pluginName,
    );

    const list = pluginUnsubs.get(pluginName) ?? [];
    list.push(unsub);
    pluginUnsubs.set(pluginName, list);

    logger.info('Plugin subscribed to topic', { pluginName, topic });
    return unsub;
  }

  return { registerPlugin, unregisterPlugin, call, broadcast, onCall, onResult, topicBus, subscribeForPlugin };
}

export { createHub, type Hub, type CallHook, type ResultHook };
