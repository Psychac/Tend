import { validationError, type ValidationIssue, type DomainError } from './errors';
import { err, ok, type Result } from './result';

/** Collects validation issues so a factory can report all problems at once. */
export class Issues {
  private readonly list: ValidationIssue[] = [];

  check(condition: boolean, path: string, message: string): void {
    if (!condition) this.list.push({ path, message });
  }

  /** Merge a nested validation failure under a path prefix. */
  absorb<T>(result: Result<T>, path: string): void {
    if (!result.ok) {
      const nested = result.error.issues;
      if (nested.length === 0) this.list.push({ path, message: result.error.message });
      for (const i of nested) this.list.push({ path: `${path}.${i.path}`, message: i.message });
    }
  }

  finish<T>(build: () => T): Result<T, DomainError> {
    return this.list.length > 0 ? err(validationError(this.list)) : ok(build());
  }
}

export const isNonBlank = (s: string): boolean => s.trim().length > 0;
