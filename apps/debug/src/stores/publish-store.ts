import { create } from 'zustand';
import type { PublishEntry } from '../types/api';
import { apiPost } from '../lib/api-client';

const MAX_HISTORY = 50;

interface PublishState {
  history: PublishEntry[];
  loading: boolean;
  lastTopic: string;
  lastPayload: string;
  publish: (topic: string, payload: unknown, mode: 'single' | 'rate') => Promise<void>;
}

let nextId = 1;

export const usePublishStore = create<PublishState>()((set, get) => ({
  history: [],
  loading: false,
  lastTopic: '/test/debug',
  lastPayload: '{"msg":"hello"}',
  publish: async (topic: string, payload: unknown, mode: 'single' | 'rate') => {
    const id = nextId++;
    const entry: PublishEntry = { id, topic, payload, timestamp: Date.now(), mode };
    set({ loading: true, history: [entry, ...get().history].slice(0, MAX_HISTORY) });
    try {
      await apiPost('/topics:publish', { topic, payload });
      set({ loading: false, lastTopic: topic, lastPayload: JSON.stringify(payload) });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
}));
