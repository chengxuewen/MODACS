// API envelope
export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

// From GET /api/topics:stats
export interface TopicStat {
  topic: string;
  subscribers: string[];
  publishers: string[];
  lastMessage: unknown;
}

// From GET /api/processes:list
export interface ProcessInfo {
  name: string;
  pid: number | null;
  status: 'running' | 'stopped' | 'restarting';
  uptime: number;
  restartCount: number;
  socketPath: string;
}

// From GET /api/recordings:list
export interface RecordingInfo {
  filename: string;
  size: number;
  created: string;
}

// From SSE /api/logs:stream
export interface LogEntry {
  time: number;
  level: string;
  name: string;
  msg: string;
  [key: string]: unknown;
}

// From GET /api/bridge:status
export interface BridgeStatus {
  active: boolean;
  port: number;
  clients: number;
}

// For RPC console
export interface RpcCall {
  id: number;
  method: string;
  params: unknown[];
  result: unknown;
  timestamp: number;
  error?: string;
}

// For MessagePublisher
export interface PublishEntry {
  id: number;
  topic: string;
  payload: unknown;
  timestamp: number;
  mode: 'single' | 'rate';
}
