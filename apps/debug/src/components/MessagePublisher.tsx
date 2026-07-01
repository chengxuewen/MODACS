import { useState, useRef, useCallback, useEffect } from 'react';
import { usePublishStore } from '../stores/publish-store';
import type { PanelProps } from '../lib/panel-registry';

type PublishMode = 'single' | 'rate';

interface MessagePublisherProps extends PanelProps {}

export function MessagePublisher({ activeTopic }: MessagePublisherProps) {
  const history = usePublishStore((s) => s.history);
  const loading = usePublishStore((s) => s.loading);
  const lastTopic = usePublishStore((s) => s.lastTopic);
  const lastPayload = usePublishStore((s) => s.lastPayload);
  const publish = usePublishStore((s) => s.publish);

  const [topic, setTopic] = useState(lastTopic);
  const [payload, setPayload] = useState(lastPayload);
  const [mode, setMode] = useState<PublishMode>('single');
  const [hz, setHz] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isRateRunning, setIsRateRunning] = useState(false);
  const [rateCount, setRateCount] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const topicRef = useRef(topic);
  const payloadRef = useRef(payload);

  topicRef.current = topic;
  payloadRef.current = payload;

  useEffect(() => {
    if (activeTopic && activeTopic !== topic) {
      setTopic(activeTopic);
    }
  }, [activeTopic, topic]);

  const stopRate = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRateRunning(false);
  }, []);

  const doPublish = useCallback(async () => {
    const currentTopic = topicRef.current;
    const currentPayload = payloadRef.current;

    let parsed: unknown;
    try {
      parsed = JSON.parse(currentPayload);
    } catch {
      setError('Invalid JSON payload');
      stopRate();
      return;
    }
    setError(null);

    try {
      await publish(currentTopic, parsed, mode);
      if (mode === 'rate') {
        setRateCount((c) => c + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
      stopRate();
    }
  }, [mode, publish, stopRate]);

  const startRate = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRef.current);
    } catch {
      setError('Invalid JSON payload');
      return;
    }
    if (!topicRef.current.trim()) {
      setError('Topic is required');
      return;
    }
    setError(null);
    setRateCount(0);
    setIsRateRunning(true);
    const intervalMs = Math.max(1000 / hz, 10);
    intervalRef.current = setInterval(doPublish, intervalMs);
  }, [hz, publish, doPublish, stopRate]);

  const handlePublish = useCallback(() => {
    if (mode === 'rate') {
      if (isRateRunning) {
        stopRate();
      } else {
        startRate();
      }
    } else {
      doPublish();
    }
  }, [mode, isRateRunning, stopRate, startRate, doPublish]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const jsonValid = (() => {
    try {
      JSON.parse(payload);
      return true;
    } catch {
      return false;
    }
  })();

  const canPublish = topic.trim().length > 0 && jsonValid && !loading;
  const isRateMode = mode === 'rate';
  const buttonLabel = isRateMode
    ? isRateRunning
      ? 'Stop'
      : 'Publish'
    : loading
      ? 'Publishing…'
      : 'Publish';

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">
          Message Publisher
        </h2>
        <span className="text-xs text-zinc-500">
          {history.length} sent total
        </span>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        {/* Topic input */}
        <div className="flex flex-col gap-1">
          <label htmlFor="pub-topic" className="text-xs font-medium text-zinc-400">
            Topic
          </label>
          <input
            id="pub-topic"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="/module/category/name"
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            spellCheck={false}
          />
        </div>

        {/* Payload textarea */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="pub-payload" className="text-xs font-medium text-zinc-400">
              Payload (JSON)
            </label>
            <span className={`text-xs ${jsonValid ? 'text-emerald-500' : 'text-red-500'}`}>
              {jsonValid ? 'valid' : 'invalid'}
            </span>
          </div>
          <textarea
            id="pub-payload"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder='{"key": "value"}'
            rows={5}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 resize-y"
            spellCheck={false}
          />
        </div>

        {/* Mode + Hz row */}
        <div className="flex items-end gap-3">
          {/* Mode toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-zinc-400">Mode</label>
            <div className="flex rounded-md border border-zinc-700 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  stopRate();
                  setMode('single');
                }}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  mode === 'single'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-300'
                }`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => {
                  stopRate();
                  setMode('rate');
                }}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  mode === 'rate'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'bg-zinc-900 text-zinc-400 hover:text-zinc-300'
                }`}
              >
                Rate
              </button>
            </div>
          </div>

          {/* Hz input (rate mode only) */}
          {isRateMode && (
            <div className="flex flex-col gap-1">
              <label htmlFor="pub-hz" className="text-xs font-medium text-zinc-400">
                Rate (Hz)
              </label>
              <input
                id="pub-hz"
                type="number"
                min={0.1}
                step={0.1}
                value={hz}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > 0) setHz(val);
                }}
                disabled={isRateRunning}
                className="w-24 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />
            </div>
          )}

          {/* Count display (rate mode only) */}
          {isRateMode && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-400">Count</span>
              <span className="px-3 py-2 text-sm font-mono text-zinc-100 bg-zinc-900 rounded-md border border-zinc-700 min-w-[3rem] text-center">
                {rateCount}
              </span>
            </div>
          )}

          {/* Publish / Stop button */}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handlePublish}
            disabled={!canPublish && !(isRateMode && isRateRunning)}
            className={`px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
              isRateMode && isRateRunning
                ? 'bg-red-600 text-white hover:bg-red-500'
                : canPublish
                  ? 'bg-zinc-100 text-zinc-950 hover:bg-white'
                  : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            }`}
          >
            {buttonLabel}
          </button>
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-md border border-red-800 bg-red-950/50 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* History panel */}
      <div className="flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
            History
          </h3>
          {history.length > 0 && (
            <span className="text-xs text-zinc-600">
              last {history.length} {history.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900/50">
          {history.length === 0 ? (
            <div className="flex items-center justify-center h-full text-xs text-zinc-600">
              No messages published yet
            </div>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {history.map((entry) => (
                <li key={entry.id} className="px-3 py-2 hover:bg-zinc-800/30">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-zinc-500">
                      {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                    </span>
                    <span className="font-mono text-emerald-500">{entry.topic}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        entry.mode === 'rate'
                          ? 'bg-blue-950 text-blue-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {entry.mode}
                    </span>
                  </div>
                  <pre className="mt-1 text-[11px] font-mono text-zinc-400 truncate">
                    {JSON.stringify(entry.payload)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
