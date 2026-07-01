import { useState, useEffect, type JSX } from 'react';
import { apiGet } from '@debug/lib/api-client';
import type { BridgeStatus as BridgeStatusInfo } from '@debug/types/api';

const POLL_INTERVAL_MS = 5_000;

export function BridgeStatus(): JSX.Element {
  const [status, setStatus] = useState<BridgeStatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchStatus(): Promise<void> {
      try {
        const data = await apiGet<BridgeStatusInfo>('/bridge:status');
        setStatus(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch bridge status');
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const isActive = status?.active ?? false;
  const clients = status?.clients ?? 0;
  const port = status?.port ?? 8765;
  const wsUrl = `ws://127.0.0.1:${port}`;

  const dotColor = !isActive
    ? 'bg-red-500'
    : clients > 0
      ? 'bg-green-500'
      : 'bg-amber-500';

  const statusText = !isActive
    ? 'Inactive'
    : clients > 0
      ? `Active · ${clients} client${clients !== 1 ? 's' : ''}`
      : 'Active · No clients';

  function copyUrl(): void {
    navigator.clipboard.writeText(wsUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // clipboard not available
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className={`inline-block h-3 w-3 rounded-full ${dotColor}`} />
          <span className="text-lg font-semibold text-zinc-100">{statusText}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <InfoBlock label="State" value={isActive ? 'Active' : 'Inactive'} />
          <InfoBlock label="Port" value={String(port)} />
          <InfoBlock label="Clients" value={String(clients)} />
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-5">
        <h2 className="text-sm font-semibold text-zinc-200">Connection</h2>
        <div className="mt-3 flex items-center gap-3">
          <code className="rounded bg-zinc-800 px-3 py-1.5 font-mono text-sm text-zinc-300">{wsUrl}</code>
          <button
            onClick={copyUrl}
            className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <a
          href="https://foxglove.dev/studio"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm text-blue-400 hover:text-blue-300 hover:underline"
        >
          Open Foxglove Studio ↗
        </a>
      </div>
    </div>
  );
}

interface InfoBlockProps {
  label: string;
  value: string;
}

function InfoBlock({ label, value }: InfoBlockProps): JSX.Element {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-base font-medium text-zinc-100">{value}</div>
    </div>
  );
}
