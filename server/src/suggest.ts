/**
 * Home-screen suggestions. With an empty library these are a random slice of
 * a fixed pool; once there are series, one cheap Flash call proposes topics
 * adjacent to what has actually been listened to. Cached against the library
 * contents, so it costs one call per change rather than one per page load.
 */
import { suggestTopics } from './llm.js';
import { allThreads } from './store.js';

const STARTERS = [
  'the fall of Rome',
  'how transformers work',
  'why bridges stand up',
  'wine tasting',
  'interest rates',
  'the metric system',
  'negotiation',
  'how vaccines work',
  'the physics of climbing',
  'chess engines',
  'sourdough',
  'black holes',
];

export interface Suggestions {
  topics: string[];
  from: 'library' | 'starters';
}

function sample(pool: string[], n: number): string[] {
  return [...pool].sort(() => Math.random() - 0.5).slice(0, n);
}

let cache: { key: string; value: Suggestions } | null = null;

export async function suggestions(): Promise<Suggestions> {
  const topics = allThreads().map((t) => t.topic);
  if (topics.length === 0) return { topics: sample(STARTERS, 3), from: 'starters' };

  const key = [...topics].sort().join('|');
  if (cache?.key === key) return cache.value;

  try {
    const fresh = await suggestTopics(topics);
    const value: Suggestions = { topics: fresh.slice(0, 3), from: 'library' };
    cache = { key, value };
    return value;
  } catch (err) {
    console.error('suggestions:', (err as Error).message);
    return { topics: sample(STARTERS, 3), from: 'starters' };
  }
}
