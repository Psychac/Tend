import type { AttachmentStorage } from '@tend/contracts';
import type { AttachmentId } from '@tend/domain';

/** In memory; for tests and tools. Nothing survives a reload. */
export function createMemoryAttachmentStorage(now: () => number = Date.now): AttachmentStorage & {
  readonly size: () => number;
} {
  const files = new Map<string, { data: Blob; modifiedAt: number }>();
  return {
    put: async (id, data) => void files.set(id, { data, modifiedAt: now() }),
    get: async (id) => files.get(id)?.data ?? null,
    remove: async (id) => void files.delete(id),
    list: async () =>
      [...files.entries()].map(([id, f]) => ({ id: id as AttachmentId, modifiedAt: f.modifiedAt })),
    size: () => files.size,
  };
}
