/**
 * MODACS Server — application assembly and wiring.
 *
 * Creates and connects all system components:
 * - Logger, RPC Hub, MCAP Recorder, Foxglove Bridge
 * - Spawns and registers the base plugin process
 * - Hooks recorder to hub call/result events
 * - Provides a unified close() for graceful shutdown
 */

import { createLogger } from '../../../packages/core/src/logger.ts';
import { createHub } from '../../../packages/core/src/rpc/hub.ts';
import { spawn } from '../../../packages/core/src/process-manager.ts';
import { createRecorder } from '../../../packages/core/src/recorder.ts';
import { createTopicBus } from '../../../packages/core/src/topic-bus.ts';
import { createBridge } from '../../../packages/core/src/foxglove-bridge.ts';
import { formatSocketPath } from '../../../packages/core/src/rpc/protocol.ts';
import type { ManagedProcess } from '../../../packages/core/src/process-manager.ts';
import type { Hub } from '../../../packages/core/src/rpc/hub.ts';
import type { Recorder } from '../../../packages/core/src/recorder.ts';
import type { FoxgloveBridge } from '../../../packages/core/src/foxglove-bridge.ts';
import { existsSync } from 'node:fs';

const SOCKET_POLL_INTERVAL_MS = 100;
const SOCKET_POLL_MAX_RETRIES = 50; // 5 seconds total

export interface ServerComponents {
  hub: Hub;
  recorder: Recorder;
  bridge: FoxgloveBridge;
  close: () => Promise<void>;
}

async function createApp(): Promise<ServerComponents> {
  const topicBus = createTopicBus();
  const logger = createLogger('modacs-server', topicBus);
  const hub = createHub();
  const recorder = createRecorder('/tmp/modacs/recordings', topicBus);
  const bridge = createBridge(topicBus);
  const pluginsToKill: ManagedProcess[] = [];

  // Spawn base plugin process
  const baseProcess = spawn('./apps/base/src/index.ts', {
    MODACS_PLUGIN_NAME: 'base',
  });
  pluginsToKill.push(baseProcess);

  // Wait for base plugin's UDS socket to be ready (max 5 seconds)
  const baseSocket = formatSocketPath('base');
  for (let i = 0; i < SOCKET_POLL_MAX_RETRIES; i++) {
    if (existsSync(baseSocket)) {
      logger.info('Base plugin socket ready', { socket: baseSocket });
      break;
    }
    await new Promise(resolve => setTimeout(resolve, SOCKET_POLL_INTERVAL_MS));
  }
  if (!existsSync(baseSocket)) {
    throw new Error(`Base plugin socket ${baseSocket} not created within 5s timeout`);
  }


  // Register base plugin socket path with hub
  hub.registerPlugin('base', formatSocketPath('base'));

  // Hook recorder to hub call/result events
  hub.onCall((_plugin: string, method: string, params: unknown[]) => {
    topicBus.publish(`/rpc/${method}/request`, { plugin: _plugin, method, params });
    recorder.record(`/rpc/${method}`, { method, params, result: null });
  });
  hub.onResult((_plugin: string, method: string, result: unknown) => {
    topicBus.publish(`/rpc/${method}/response`, { plugin: _plugin, method, result });
    recorder.record(`/rpc/${method}`, { method, params: [], result });
  });


  // Warmup: populate TopicBus with known topics for Foxglove bridge discovery
  await hub.call('base', 'echo', ['warmup']);

  // Publish known RPC topics to TopicBus for Foxglove bridge discovery
  topicBus.publish('/rpc/echo/request', { plugin: 'base', method: 'echo' });
  topicBus.publish('/rpc/echo/response', { plugin: 'base', method: 'echo' });
  logger.info('Server components assembled', {
    plugin: 'base',
    socket: formatSocketPath('base'),
  });

  async function close(): Promise<void> {
    await recorder.close();
    bridge.close();
    for (const p of pluginsToKill) {
      p.kill('SIGTERM');
    }
  }

  return { hub, recorder, bridge, close };
}

export { createApp };