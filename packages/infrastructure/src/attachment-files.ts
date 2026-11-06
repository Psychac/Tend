import type { AttachmentStorage, StoredFileInfo } from '@tend/contracts';
import type { AttachmentId } from '@tend/domain';

const DIRECTORY = 'tend-attachments';

/** True where the browser has the origin private file system. */
export const hasOpfs = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';

async function directory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIRECTORY, { create: true });
}

const isNotFound = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { name?: string }).name === 'NotFoundError';

/**
 * Attachment files in the browser's origin private file system (OPFS): the same storage the
 * database uses, but outside it, so the database stays small. A write that runs out of room
 * rejects with the browser's QuotaExceededError and leaves no partial file behind.
 */
export function createOpfsAttachmentStorage(): AttachmentStorage {
  return {
    async put(id, data) {
      const dir = await directory();
      const handle = await dir.getFileHandle(id, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(data);
        await writable.close();
      } catch (e) {
        // Do not leave a half-written file that would later look like a real attachment.
        await writable.abort().catch(() => undefined);
        await dir.removeEntry(id).catch(() => undefined);
        throw e;
      }
    },

    async get(id) {
      try {
        const handle = await (await directory()).getFileHandle(id);
        return await handle.getFile();
      } catch (e) {
        if (isNotFound(e)) return null;
        throw e;
      }
    },

    async remove(id) {
      try {
        await (await directory()).removeEntry(id);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    },

    async list() {
      const dir = await directory();
      const found: StoredFileInfo[] = [];
      // FileSystemDirectoryHandle is async-iterable in browsers; the DOM lib types lag behind.
      const entries = dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
      for await (const [name, handle] of entries) {
        if (handle.kind !== 'file') continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        found.push({ id: name as AttachmentId, modifiedAt: file.lastModified });
      }
      return found;
    },
  };
}

/** Stands in where OPFS is missing, so attaching says why it cannot work instead of failing oddly. */
export function createUnavailableAttachmentStorage(): AttachmentStorage {
  const unavailable = () =>
    Promise.reject(new Error('This browser cannot store files on this device.'));
  return {
    put: unavailable,
    get: () => Promise.resolve(null),
    remove: () => Promise.resolve(),
    list: () => Promise.resolve([]),
  };
}

/** The attachment storage for this browser. */
export const openAttachmentStorage = (): AttachmentStorage =>
  hasOpfs() ? createOpfsAttachmentStorage() : createUnavailableAttachmentStorage();

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
