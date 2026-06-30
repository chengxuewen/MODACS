/** Topic naming conventions: slash style /module/category/name */

/** Build topic path for RPC method calls: /rpc/{method} */
export function topicForRpc(method: string): string {
  return `/rpc/${method}`;
}

/** Build topic path for events: /event/{module}/{name} */
export function topicForEvent(module: string, name: string): string {
  return `/event/${module}/${name}`;
}

/** Build topic path for lifecycle events: /lifecycle/{module} */
export function topicForLifecycle(module: string): string {
  return `/lifecycle/${module}`;
}

/** Topic info returned by TopicBus.getTopics() */
export interface TopicInfo {
  topic: string;
  publishers: string[];
  subscribers: string[];
}

/** Validate topic name: only [a-zA-Z0-9_/*-]+ */
export function isValidTopic(topic: string): boolean {
  return /^[a-zA-Z0-9_/*-]+$/.test(topic);
}

/** Wildcard prefix match: /rpc/* matches /rpc/echo, /rpc/echo/result */
export function topicMatches(pattern: string, topic: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return topic.startsWith(prefix);
  }
  return pattern === topic;
}