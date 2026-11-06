import type { Repositories } from '@tend/contracts';
import type { Clock, Id, IdGenerator, Instant, UserId } from '@tend/domain';
import type { Deps } from '../deps';
import { createInMemoryStore, createMemoryFiles, type MemoryFiles } from './in-memory';

export const OWNER = '11111111-1111-4111-8111-111111111111' as UserId;

/** A clock tests can move forward. */
export class FakeClock implements Clock {
  constructor(private current: Instant) {}

  now(): Instant {
    return this.current;
  }

  set(instant: string): void {
    this.current = instant as Instant;
  }
}

function sequentialIds(): IdGenerator {
  let n = 0;
  return {
    next<K extends string>(): Id<K> {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Id<K>;
    },
  };
}

export interface Harness {
  readonly files: MemoryFiles;
  readonly deps: Deps;
  readonly repos: Repositories;
  readonly clock: FakeClock;
}

/** Fresh in-memory deps; `now` defaults to noon in Kolkata on 2026-11-05 (a Thursday). */
export function createHarness(now = '2026-11-05T06:30:00.000Z'): Harness {
  const { repos, uow } = createInMemoryStore();
  const clock = new FakeClock(now as Instant);
  const files = createMemoryFiles(() => Date.parse(clock.now()));
  return { deps: { ownerId: OWNER, clock, ids: sequentialIds(), uow, files }, files, repos, clock };
}
