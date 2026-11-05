export type ErrorCode = 'validation' | 'invariant' | 'not_found' | 'conflict' | 'unauthorized';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

/** Plain-data error carried in Result values; never thrown by the domain. */
export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
}

export const validationError = (issues: readonly ValidationIssue[]): DomainError => ({
  code: 'validation',
  message: issues.map((i) => `${i.path}: ${i.message}`).join('; ') || 'Validation failed',
  issues,
});

export const invariantError = (message: string): DomainError => ({
  code: 'invariant',
  message,
  issues: [],
});
