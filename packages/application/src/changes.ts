import type { Repositories } from '@tend/contracts';
import type { AuditAction, Instant } from '@tend/domain';

export interface ChangeEntry {
  readonly id: string;
  readonly at: Instant;
  /** "Clean AC filter: snoozed until 2026-11-08", or the name alone for a creation. */
  readonly text: string;
  readonly action: AuditAction;
  /** What kind of thing changed, as a person would say it. */
  readonly kind: string;
}

const KIND: Record<string, string> = {
  activity: 'Activity',
  asset: 'Asset',
  occurrence: 'Item',
  completion: 'Entry',
  category: 'Category',
  location: 'Place',
  reminder: 'Reminder',
  attachment: 'File',
  measurement: 'Reading',
  schedule: 'Schedule',
};

const VERB: Record<AuditAction, string> = {
  created: 'Added',
  updated: 'Changed',
  deleted: 'Removed',
  archived: 'Archived',
  restored: 'Restored',
};

/** The most recent changes, newest first, worded for a person rather than as raw events. */
export async function getRecentChanges(repos: Repositories, limit = 50): Promise<ChangeEntry[]> {
  const events = await repos.audit.list({ limit });
  return events.map((e) => ({
    id: e.id,
    at: e.occurredAt,
    action: e.action,
    kind: KIND[e.entityType] ?? 'Item',
    text: `${VERB[e.action]} ${(KIND[e.entityType] ?? 'item').toLowerCase()}${e.summary ? `: ${e.summary}` : ''}`,
  }));
}
