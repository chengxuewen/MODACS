import { useState, useEffect, type JSX } from 'react';
import { apiGet } from '@debug/lib/api-client';
import type { ProcessInfo } from '@debug/types/api';

const POLL_INTERVAL_MS = 3_000;

const STATUS_STYLES: Record<ProcessInfo['status'], string> = {
  running: 'bg-green-950 text-green-400 border-green-800',
  stopped: 'bg-red-950 text-red-400 border-red-800',
  restarting: 'bg-amber-950 text-amber-400 border-amber-800',
};

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function StatusBadge({ status }: { status: ProcessInfo['status'] }): JSX.Element {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

export function ProcessMonitor(): JSX.Element {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProcesses(): Promise<void> {
      try {
        const data = await apiGet<ProcessInfo[]>('/processes:list');
        setProcesses(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch processes');
      } finally {
        setLoading(false);
      }
    }
    fetchProcesses();
    const interval = setInterval(fetchProcesses, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Managed Processes</h2>
        </div>
        {loading && processes.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">Loading…</div>
        ) : processes.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">No processes running</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-500">
                <th className="px-4 py-2 font-medium">Plugin Name</th>
                <th className="px-4 py-2 font-medium">PID</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Uptime</th>
                <th className="px-4 py-2 font-medium">Restarts</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((proc) => (
                <tr key={proc.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-2 font-mono text-zinc-300">{proc.name}</td>
                  <td className="px-4 py-2 text-zinc-400">{proc.pid ?? '—'}</td>
                  <td className="px-4 py-2"><StatusBadge status={proc.status} /></td>
                  <td className="px-4 py-2 text-zinc-400">{formatUptime(proc.uptime)}</td>
                  <td className="px-4 py-2 text-zinc-400">{proc.restartCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
