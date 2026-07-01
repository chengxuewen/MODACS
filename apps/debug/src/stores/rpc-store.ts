import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RpcCall } from '../types/api';

const MAX_HISTORY = 100;

interface RpcState {
  history: RpcCall[];
  loading: boolean;
  lastMethod: string;
  lastParams: string;
  sendRpc: (method: string, params: unknown[]) => Promise<void>;
  setLastMethod: (method: string) => void;
  setLastParams: (params: string) => void;
}

let nextId = 1;

export const useRpcStore = create<RpcState>()(
  persist(
    (set, get) => ({
      history: [],
      loading: false,
      lastMethod: 'echo',
      lastParams: '["hello"]',
      sendRpc: async (method: string, params: unknown[]) => {
        const id = nextId++;
        const entry: RpcCall = { id, method, params: [...params], result: null, timestamp: Date.now() };
        set({ loading: true, history: [entry, ...get().history].slice(0, MAX_HISTORY) });
        try {
          const response = await fetch(`/rpc/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
          });
          if (!response.ok) {
            throw new Error(`RPC error ${response.status}: ${response.statusText}`);
          }
          const json = await response.json() as { result: unknown };
          set((s) => ({
            loading: false,
            history: s.history.map((h) =>
              h.id === id ? { ...h, result: json.result } : h
            ),
          }));
        } catch (err) {
          set((s) => ({
            loading: false,
            history: s.history.map((h) =>
              h.id === id ? { ...h, error: err instanceof Error ? err.message : 'RPC failed' } : h
            ),
          }));
        }
      },
      setLastMethod: (method) => set({ lastMethod: method }),
      setLastParams: (params) => set({ lastParams: params }),
    }),
    {
      name: 'modacs-debug-rpc',
      partialize: (s) => ({ lastMethod: s.lastMethod, lastParams: s.lastParams }),
    },
  ),
);
