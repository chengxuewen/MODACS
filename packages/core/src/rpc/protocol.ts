/** JSON-RPC 2.0 protocol types, serialization & error codes. */

import type { Logger } from '../logger.ts';

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export const APPLICATION_ERROR = -32000;

export const SOCKET_BASE = '/tmp/modacs/';
export function formatSocketPath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${SOCKET_BASE}${safe}.sock`;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown[];
  id: number | string;
}
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown[];
}
export interface JsonRpcError {
  jsonrpc: '2.0';
  error: { code: number; message: string; data?: unknown };
  id: number | string | null;
}
export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result: unknown;
  id: number | string;
}
export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcResponse
  | JsonRpcError;

export function serializeRequest(
  method: string,
  params: unknown[] = [],
  id?: number | string,
): string {
  const request = id !== undefined
    ? { jsonrpc: '2.0' as const, method, params, id }
    : { jsonrpc: '2.0' as const, method, params };
  return JSON.stringify(request);
}

export function parseResponse(raw: string, logger?: Logger): JsonRpcResponse | JsonRpcError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    logger?.error('Failed to parse JSON-RPC response', cause as Error);
    throw new Error(`Invalid JSON: ${(cause as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('JSON-RPC response is not a JSON object');
  }

  const msg = parsed as Record<string, unknown>;
  if (msg.jsonrpc !== '2.0') {
    throw new Error(`Invalid jsonrpc version: ${JSON.stringify(msg.jsonrpc)}`);
  }

  if ('error' in msg) return parsed as JsonRpcError;
  if ('result' in msg) return parsed as JsonRpcResponse;
  throw new Error('JSON-RPC response must contain "result" or "error"');
}
/** Create a JSON-RPC 2.0 Error object with id=null. */
export function createError(code: number, message: string, data?: unknown): JsonRpcError {
  const error: { code: number; message: string; data?: unknown } = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', error, id: null };
}
