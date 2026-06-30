/**
 * MODACS Topic Bus — in-process pub/sub engine with wildcard support.
 *
 * Zero external dependencies. Uses the structured logger for debug output.
 * Supports retained messages (last message per topic) and wildcard subscriptions
 * where `*` is a complete path segment (e.g. `/rpc/*` matches `/rpc/echo`).
 */

import { createLogger } from './logger.ts';
import { isValidTopic, topicMatches, type TopicInfo } from './topic-types.ts';

// Re-export TopicInfo so consumers can import everything from topic-bus
export type { TopicInfo } from './topic-types.ts';

/** Options passed to {@link TopicBus.publish}. */
export interface PublishOptions {
  /** If true, store this message as the last retained message for the topic. */
  retainLast?: boolean;
}

/** In-process topic bus for pub/sub messaging with wildcard support. */
export interface TopicBus {
  /** Publish data to a topic, notifying all matching subscribers. */
  publish(topic: string, data: unknown, options?: PublishOptions): void;
  /** Subscribe to a topic (or wildcard pattern). Returns an unsubscribe function. */
  subscribe(topic: string, callback: (data: unknown) => void, subscriberId?: string): () => void;
  /** Return information about all active topics (subscribed, published, or retained). */
  getTopics(): TopicInfo[];
  /** Return the last retained message for a topic, or undefined. */
  getLastMessage(topic: string): unknown | undefined;
}

/** Internal subscription record stored per topic pattern. */
interface Subscription {
  callback: (data: unknown) => void;
  subscriberId: string;
}

const logger = createLogger('topic-bus');

/**
 * Check whether a pattern uses `*` as a complete path segment wildcard.
 *
 * `/rpc/*` → true  (wildcard — matches everything under `/rpc/`)
 * `*`      → true  (wildcard — matches all topics)
 * `/rpc/e*`→ false (not a wildcard — `*` is part of the `e*` segment)
 */
function isWildcardPattern(pattern: string): boolean {
  return pattern === '*' || pattern.endsWith('/*');
}

/**
 * Match a subscription pattern against a concrete topic.
 *
 * Only `*` as a complete trailing segment (`/*` or bare `*`) is treated as a
 * prefix wildcard. Patterns like `/rpc/e*` fall through to exact match.
 */
function matchesSubscription(pattern: string, topic: string): boolean {
  if (isWildcardPattern(pattern)) {
    return topicMatches(pattern, topic);
  }
  return pattern === topic;
}

/** Generate an anonymous subscriber ID when none is provided. */
function generateSubscriberId(): string {
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new in-process {@link TopicBus}.
 *
 * The bus maintains subscriptions keyed by pattern, retained messages keyed by
 * topic, and a set of topics that have been published to (so `getTopics()`
 * includes them even without subscribers).
 */
function createTopicBus(): TopicBus {
  /** Subscription pattern → set of active subscriptions. */
  const subscriptions = new Map<string, Set<Subscription>>();
  /** Concrete topic → last retained message (only one per topic). */
  const retainedMessages = new Map<string, unknown>();
  /** Topics that have been published to (publishers inferred). */
  const publishedTopics = new Set<string>();

  function publish(topic: string, data: unknown, options?: PublishOptions): void {
    if (!isValidTopic(topic)) {
      throw new Error(`Invalid topic name: "${topic}"`);
    }

    publishedTopics.add(topic);

    if (options?.retainLast === true) {
      retainedMessages.set(topic, data);
    }

    let matched = false;
    for (const [pattern, subs] of subscriptions) {
      if (matchesSubscription(pattern, topic)) {
        matched = true;
        for (const sub of subs) {
          try {
            sub.callback(data);
          } catch (err) {
            logger.error('Subscriber callback threw', err);
          }
        }
      }
    }

    if (!matched) {
      logger.debug(`no subscribers for ${topic}`);
    }
  }

  function subscribe(
    topic: string,
    callback: (data: unknown) => void,
    subscriberId?: string,
  ): () => void {
    if (!isValidTopic(topic)) {
      throw new Error(`Invalid topic name: "${topic}"`);
    }

    const id = subscriberId ?? generateSubscriberId();

    let subs = subscriptions.get(topic);
    if (subs === undefined) {
      subs = new Set<Subscription>();
      subscriptions.set(topic, subs);
    }

    // Dedupe: if the same subscriberId is already subscribed to this topic, skip
    for (const existing of subs) {
      if (existing.subscriberId === id) {
        logger.debug(`duplicate subscription for ${topic} by ${id}`);
        return () => {};
      }
    }

    const subscription: Subscription = { callback, subscriberId: id };
    subs.add(subscription);

    // If this exact topic has a retained message, deliver it immediately
    const retained = retainedMessages.get(topic);
    if (retained !== undefined) {
      try {
        callback(retained);
      } catch (err) {
        logger.error('Retained message callback threw', err);
      }
    }

    // Return unsubscribe function
    return () => {
      const current = subscriptions.get(topic);
      if (current === undefined) {
        return;
      }
      for (const sub of current) {
        if (sub.subscriberId === id) {
          current.delete(sub);
          break;
        }
      }
      if (current.size === 0) {
        subscriptions.delete(topic);
      }
    };
  }

  function getTopics(): TopicInfo[] {
    const allTopics = new Set<string>();
    for (const topic of subscriptions.keys()) {
      allTopics.add(topic);
    }
    for (const topic of retainedMessages.keys()) {
      allTopics.add(topic);
    }
    for (const topic of publishedTopics) {
      allTopics.add(topic);
    }

    return Array.from(allTopics).map((topic) => ({
      topic,
      publishers: [], // publish() has no publisherId — publishers inferred from publishedTopics
      subscribers: Array.from(subscriptions.get(topic) ?? [], (s) => s.subscriberId),
    }));
  }

  function getLastMessage(topic: string): unknown | undefined {
    return retainedMessages.get(topic);
  }

  return { publish, subscribe, getTopics, getLastMessage };
}

export { createTopicBus };
