import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TopicStat } from '../types/api';
import { apiGet } from '../lib/api-client';

interface TopicState {
  topics: TopicStat[];
  loading: boolean;
  error: string | null;
  selectedTopics: string[];
  fetchTopics: () => Promise<void>;
  toggleTopic: (topic: string) => void;
}

export const useTopicStore = create<TopicState>()(
  persist(
    (set, get) => ({
      topics: [],
      loading: false,
      error: null,
      selectedTopics: [],
      fetchTopics: async () => {
        set({ loading: true, error: null });
        try {
          const topics = await apiGet<TopicStat[]>('/topics:stats');
          set({ topics, loading: false });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to fetch topics', loading: false });
        }
      },
      toggleTopic: (topic: string) => {
        const { selectedTopics } = get();
        set({
          selectedTopics: selectedTopics.includes(topic)
            ? selectedTopics.filter(t => t !== topic)
            : [...selectedTopics, topic],
        });
      },
    }),
    { name: 'modacs-debug-topics', partialize: (state) => ({ selectedTopics: state.selectedTopics }) },
  ),
);
