import type { TopicStat } from '../types/api';

export interface RateDataPoint {
  time: number;
  rate: number;
}

export interface TopicRate {
  topic: string;
  rates: RateDataPoint[];
}

export class RateTracker {
  private history: Map<string, RateDataPoint[]> = new Map();
  private lastCounts: Map<string, number> = new Map();
  private maxPoints: number;

  constructor(maxPoints = 30) {
    this.maxPoints = maxPoints;
  }

  update(topics: TopicStat[]): void {
    const now = Date.now();
    for (const t of topics) {
      const subscriberCount = t.subscribers?.length ?? 0;
      const lastCount = this.lastCounts.get(t.topic) ?? 0;
      const delta = subscriberCount - lastCount;
      this.lastCounts.set(t.topic, subscriberCount);

      const existing = this.history.get(t.topic) ?? [];
      const newPoint: RateDataPoint = { time: now, rate: Math.max(0, delta) };
      const updated = [...existing, newPoint].slice(-this.maxPoints);
      this.history.set(t.topic, updated);
    }
  }

  getRates(): TopicRate[] {
    const results: TopicRate[] = [];
    for (const [topic, rates] of this.history) {
      results.push({ topic, rates });
    }
    return results;
  }

  clear(): void {
    this.history.clear();
    this.lastCounts.clear();
  }
}
