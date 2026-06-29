/**
 * MODACS Server — application assembly and wiring.
 *
 * Creates and connects all system components:
 * - Logger, RPC Hub, MCAP Recorder, Foxglove Bridge
 * - Spawns and registers the base plugin process
 * - Hooks recorder to hub call/result events
 * - Provides a unified close() for graceful shutdown
 */

import { createLogger } from '../../packages/core/src/logger.ts';
import { createHub } from '../../packages/core/src/rpc/hub.ts';
import { spawn } from '../../packages/core/src/process-manager.ts';
import { createRecorder } from '../../packages/core/src/recorder.ts';
import { createBridge } from '../../packages/core/src/foxglove-bridge.ts';
import { formatSocketPath } from '../../packages/core/src/rpc/protocol.ts';
import type { ManagedProcess } from '../../packages/core/src/process-manager.ts';
import type { Hub } from '../../packages/core/src/rpc/hub.ts';
import type { Recorder } from '../../packages/core/src/recorder.ts';
import type { FoxgloveBridge } from '../../packages/core/src/foxglove-bridge.ts';

export interface ServerComponents {
  hub: Hub;
  recorder: Recorder;
  bridge: FoxgloveBridge;
  close: () => Promise<void>;
}

function createApp(): ServerComponents {
  const logger = createLogger('modacs-server');
  const hub = createHub();
  const recorder = createRecorder('/tmp/modacs/recordings');
  const bridge = createBridge();
  const pluginsToKill: ManagedProcess[] = [];

  // Spawn base plugin process
  const baseProcess = spawn('./apps/base/src/index.ts', {
    MODACS_PLUGIN_NAME: 'base',
  });
  pluginsToKill.push(baseProcess);

  // Register base plugin socket path with hub
  hub.registerPlugin('base', formatSocketPath('base'));

  // Hook recorder to hub call/result events
  hub.onCall((_plugin: string, method: string, params: unknown[]) => {
    recorder.record(method, params, null);
  });
  hub.onResult((_plugin: string, method: string, result: unknown) => {
    recorder.record(method, [], result);
  });

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