import { useState, useEffect, type JSX } from 'react';
import { apiGet } from '@debug/lib/api-client';
import type { RecordingInfo, TopicStat } from '@debug/types/api';

const POLL_INTERVAL_MS = 5_000;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function McapControl(): JSX.Element {
  const [recordings, setRecordings] = useState<RecordingInfo[]>([]);
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData(): Promise<void> {
      try {
        const [recs, tops] = await Promise.all([
          apiGet<RecordingInfo[]>('/recordings:list'),
          apiGet<TopicStat[]>('/topics:stats'),
        ]);
        setRecordings(recs);
        setTopics(tops);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const totalSize = recordings.reduce((sum, r) => sum + r.size, 0);
  const latestRecording = recordings.length > 0 ? recordings[recordings.length - 1] : null;
  const activeChannels = topics.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatusCard label="Recordings" value={String(recordings.length)} />
        <StatusCard label="Total Size" value={formatSize(totalSize)} />
        <StatusCard label="Active Channels" value={String(activeChannels)} />
        <StatusCard label="Latest File" value={latestRecording?.filename ?? '—'} mono />
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Recording Files</h2>
        </div>
        {loading && recordings.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">Loading…</div>
        ) : recordings.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-zinc-500">No recordings found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-500">
                <th className="px-4 py-2 font-medium">Filename</th>
                <th className="px-4 py-2 font-medium">Size</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((rec) => (
                <tr key={rec.filename} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-2 font-mono text-zinc-300">{rec.filename}</td>
                  <td className="px-4 py-2 text-zinc-400">{formatSize(rec.size)}</td>
                  <td className="px-4 py-2 text-zinc-400">{formatDate(rec.created)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface StatusCardProps {
  label: string;
  value: string;
  mono?: boolean;
}

function StatusCard({ label, value, mono }: StatusCardProps): JSX.Element {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold text-zinc-100 ${mono ? 'font-mono text-sm' : ''}`}>
        {value}
      </div>
    </div>
  );
}
