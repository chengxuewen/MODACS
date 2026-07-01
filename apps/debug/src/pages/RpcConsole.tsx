import { useState } from 'react';
import { useRpcStore } from '../stores/rpc-store';
import type { RpcCall } from '../types/api';

const inputClass =
  'w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500';

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function RpcConsole() {
  const history = useRpcStore((s) => s.history);
  const loading = useRpcStore((s) => s.loading);
  const lastMethod = useRpcStore((s) => s.lastMethod);
  const lastParams = useRpcStore((s) => s.lastParams);
  const sendRpc = useRpcStore((s) => s.sendRpc);
  const setLastMethod = useRpcStore((s) => s.setLastMethod);
  const setLastParams = useRpcStore((s) => s.setLastParams);

  const [method, setMethod] = useState(lastMethod);
  const [params, setParams] = useState(lastParams);
  const [parseError, setParseError] = useState<string | null>(null);

  const latest = history[0] ?? null;
  const recentHistory = history.slice(0, 5);

  const handleSend = async () => {
    setParseError(null);
    let parsed: unknown[];
    try {
      parsed = JSON.parse(params) as unknown[];
    } catch {
      setParseError('Invalid JSON: params must be a valid JSON array');
      return;
    }
    setLastMethod(method);
    setLastParams(params);
    await sendRpc(method, parsed);
  };

  const handleHistoryClick = (entry: RpcCall) => {
    setMethod(entry.method);
    setParams(JSON.stringify(entry.params, null, 2));
    setLastMethod(entry.method);
    setLastParams(JSON.stringify(entry.params));
    setParseError(null);
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      {/* Input section */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-zinc-400 mb-1">Method</label>
            <input
              className={inputClass}
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="echo"
            />
          </div>
          <div className="flex items-end">
            <button
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded px-4 py-2 font-medium transition-colors"
              onClick={handleSend}
              disabled={loading || !method.trim()}
            >
              {loading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Params (JSON array)</label>
          <textarea
            className={`${inputClass} font-mono text-sm resize-y min-h-[80px]`}
            value={params}
            onChange={(e) => setParams(e.target.value)}
            placeholder='["hello"]'
            rows={3}
          />
          {parseError && (
            <p className="text-red-400 text-xs mt-1">{parseError}</p>
          )}
        </div>
      </div>

      {/* Response + History */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Response panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <h3 className="text-xs text-zinc-400 mb-1 uppercase tracking-wide">Response</h3>
          <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded p-3 overflow-auto">
            {loading && (
              <p className="text-zinc-500 text-sm animate-pulse">Waiting for response…</p>
            )}
            {!loading && !latest && (
              <p className="text-zinc-600 text-sm">No RPC calls yet.</p>
            )}
            {!loading && latest && latest.error && (
              <pre className="text-red-400 text-sm font-mono whitespace-pre-wrap break-all">
                {latest.error}
              </pre>
            )}
            {!loading && latest && !latest.error && (
              <pre className="text-green-300 text-sm font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(latest.result, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* History panel */}
        <div className="w-64 flex flex-col shrink-0">
          <h3 className="text-xs text-zinc-400 mb-1 uppercase tracking-wide">History</h3>
          <div className="flex-1 bg-zinc-900 border border-zinc-700 rounded overflow-auto">
            {recentHistory.length === 0 && (
              <p className="text-zinc-600 text-sm p-3">No history.</p>
            )}
            <ul className="divide-y divide-zinc-800">
              {recentHistory.map((entry) => (
                <li key={entry.id}>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-zinc-800 transition-colors"
                    onClick={() => handleHistoryClick(entry)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-zinc-200 font-mono truncate">
                        {entry.method}
                      </span>
                      <span className="text-xs text-zinc-500 shrink-0">
                        {formatTime(entry.timestamp)}
                      </span>
                    </div>
                    {entry.error ? (
                      <span className="text-xs text-red-400">error</span>
                    ) : (
                      <span className="text-xs text-green-400">ok</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
