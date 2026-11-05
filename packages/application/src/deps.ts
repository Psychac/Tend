import { ConflictError, type Repositories, type UnitOfWork } from '@tend/contracts';
import {
  conflictError,
  err,
  newMeta,
  notFoundError,
  type AuditAction,
  type AuditEvent,
  type Clock,
  type DomainError,
  type IdGenerator,
  type Result,
  type UserId,
} from '@tend/domain';
import { ok } from '@tend/domain';

/** Everything a use case needs from the outside world. */
export interface Deps {
  /** The signed-in user. Repositories are already scoped to them. */
  readonly ownerId: UserId;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly uow: UnitOfWork;
}

class Rollback extends Error {
  constructor(readonly domainError: DomainError) {
    super(domainError.message);
  }
}

/**
 * Runs a use case atomically. Returning an error Result rolls back every
 * write; a stale-version save surfaces as a `conflict` error.
 */
export async function transact<T>(
  deps: Deps,
  work: (repos: Repositories) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await deps.uow.run(async (repos) => {
      const result = await work(repos);
      if (!result.ok) throw new Rollback(result.error);
      return result;
    });
  } catch (e) {
    if (e instanceof Rollback) return err(e.domainError);
    if (e instanceof ConflictError) return err(conflictError(e.message));
    throw e;
  }
}

export function found<T>(entity: string, id: string, value: T | null): Result<T> {
  return value === null ? err(notFoundError(entity, id)) : ok(value);
}

export function auditEvent(
  deps: Deps,
  entityType: string,
  entityId: string,
  action: AuditAction,
  summary?: string,
): AuditEvent {
  const now = deps.clock.now();
  return {
    id: deps.ids.next<'AuditEvent'>(),
    meta: newMeta(deps.ownerId, now),
    entityType,
    entityId,
    action,
    occurredAt: now,
    summary,
  };
}
