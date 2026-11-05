import type { Id, IdGenerator, Instant, UserId } from './core';

/** Deterministic UUID generator for tests. */
export function sequentialIds(): IdGenerator {
  let n = 0;
  return {
    next<K extends string>(): Id<K> {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Id<K>;
    },
  };
}

export const OWNER = '11111111-1111-4111-8111-111111111111' as UserId;
export const NOW = '2026-11-05T09:00:00.000Z' as Instant;
