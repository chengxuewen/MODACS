/**
 * Base plugin — echo RPC server over UDS.
 *
 * Listens on /tmp/modacs/base.sock, handles JSON-RPC method "echo".
 * This is the simplest possible plugin for validating the transport layer.
 */

import { createServer } from '../../packages/core/src/rpc/transport.ts';
import { formatSocketPath } from '../../packages/core/src/rpc/protocol.ts';
import { createLogger } from '../../packages/core/src/logger.ts';
import type { JsonRpcRequest } from '../../packages/core/src/rpc/protocol.ts';

const logger = createLogger('base-plugin');
const SOCKET_PATH = formatSocketPath('base');

/** Echo the first param back with a prefix. */
async function handleRequest(req: JsonRpcRequest): Promise<unknown> {
  if (req.method === 'echo') {
    const input = Array.isArray(req.params) ? req.params[0] : req.params;
    return `echo from base: ${input}`;
  }
  throw new Error(`Unknown method: ${req.method}`);
}

logger.info('Starting base plugin', { socketPath: SOCKET_PATH });
const server = createServer(SOCKET_PATH, handleRequest, logger);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Base plugin shutting down');
  server.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
