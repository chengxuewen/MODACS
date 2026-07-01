import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LogEntry } from '../types/api';

const MAX_LOGS = 500;

interface LogState {
  logs: LogEntry[];
  connected: boolean;
  retryCount: number;
  paused: boolean;
  levelFilter: string;
  sourceFilter: string;
  searchText: string;
  autoScroll: boolean;
  connectSSE: () => void;
  disconnectSSE: () => void;
  togglePause: () => void;
  setLevelFilter: (level: string) => void;
  setSourceFilter: (source: string) => void;
  setSearchText: (text: string) => void;
  toggleAutoScroll: () => void;
  addLog: (entry: LogEntry) => void;
  preload: (entries: LogEntry[]) => void;
  clearLogs: () => void;
}

let eventSource: EventSource | null = null;

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      logs: [],
      connected: false,
      retryCount: 0,
      paused: false,
      levelFilter: 'ALL',
      sourceFilter: '',
      searchText: '',
      autoScroll: true,
      connectSSE: () => {
        if (eventSource) return;
        eventSource = new EventSource('/api/logs:stream');
        eventSource.onopen = () => set({ connected: true, retryCount: 0 });
        eventSource.onmessage = (event) => {
          try {
            const entry: LogEntry = JSON.parse(event.data);
            if (!get().paused) {
              set((state) => ({ logs: [...state.logs, entry].slice(-MAX_LOGS) }));
            }
          } catch { /* ignore parse errors */ }
        };
        eventSource.onerror = () => {
          set({ connected: false });
          eventSource?.close();
          eventSource = null;
          const { retryCount } = get();
          if (retryCount < 5) {
            set({ retryCount: retryCount + 1 });
            setTimeout(() => get().connectSSE(), 3000);
          }
        };
      },
      disconnectSSE: () => {
        eventSource?.close();
        eventSource = null;
        set({ connected: false });
      },
      togglePause: () => set((s) => ({ paused: !s.paused })),
      setLevelFilter: (level) => set({ levelFilter: level }),
      setSourceFilter: (source) => set({ sourceFilter: source }),
      setSearchText: (text) => set({ searchText: text }),
      toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),
      addLog: (entry) => set((s) => ({ logs: [...s.logs, entry].slice(-MAX_LOGS) })),
      preload: (entries) => set({ logs: [...entries].sort((a, b) => a.time - b.time).slice(-MAX_LOGS) }),
      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'modacs-debug-logs',
      partialize: (s) => ({ levelFilter: s.levelFilter, sourceFilter: s.sourceFilter, searchText: s.searchText, autoScroll: s.autoScroll }),
    },
  ),
);
