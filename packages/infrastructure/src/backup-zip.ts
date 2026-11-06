/**
 * Backup with attached files: a zip holding `backup.json` (the ordinary backup) and each
 * attachment's bytes under `files/<id>`. A file that is missing or fails its hash on the way
 * back in is left missing; it never fails the restore.
 */
import type { AttachmentId } from '@tend/domain';
import type { AttachmentStorage } from '@tend/contracts';
import { exportBackup, type BackupFile, type BackupRow } from './backup';
import type { SqlExecutor } from './sql';
import { createZip, readZip } from './zip';

const BACKUP_ENTRY = 'backup.json';
const fileEntry = (id: string): string => `files/${id}`;

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ZipExport {
  readonly zip: Blob;
  readonly backup: BackupFile;
  readonly included: number;
  /** Attachments whose bytes were not on this device, so are not in the zip. */
  readonly missing: number;
}

export async function exportBackupZip(
  db: SqlExecutor,
  files: AttachmentStorage,
  now: string,
): Promise<ZipExport> {
  const backup = await exportBackup(db, now);
  const entries = [
    { name: BACKUP_ENTRY, data: new TextEncoder().encode(JSON.stringify(backup, null, 2)) },
  ];
  let missing = 0;
  for (const row of backup.tables.attachments) {
    const blob = await files.get(String(row['id']) as AttachmentId);
    if (!blob) missing += 1;
    else {
      entries.push({
        name: fileEntry(String(row['id'])),
        data: new Uint8Array(await blob.arrayBuffer()),
      });
    }
  }
  return { zip: createZip(entries), backup, included: entries.length - 1, missing };
}

export type ZipBackup =
  | {
      readonly ok: true;
      /** The text of `backup.json`, to pass to `parseBackup`. */
      readonly backupText: string;
      readonly files: ReadonlyMap<string, Uint8Array>;
    }
  | { readonly ok: false; readonly error: string };

export function readBackupZip(bytes: Uint8Array): ZipBackup {
  const zip = readZip(bytes);
  if (!zip.ok) return zip;
  const json = zip.entries.get(BACKUP_ENTRY);
  if (!json) {
    return { ok: false, error: 'This zip has no backup.json, so it is not a Tend backup.' };
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of zip.entries) {
    if (name.startsWith('files/')) files.set(name.slice('files/'.length), data);
  }
  return { ok: true, backupText: new TextDecoder().decode(json), files };
}

export interface FileRestoreSummary {
  readonly restored: number;
  /** Already on this device, so left alone. */
  readonly alreadyHere: number;
  /** In the backup's records but not in the zip. */
  readonly notInZip: number;
  /** In the zip but failing size or hash, so not restored. */
  readonly damaged: number;
}

/** Puts the zip's files back, after the records themselves have been restored. */
export async function restoreBackupFiles(
  files: AttachmentStorage,
  backup: BackupFile,
  fromZip: ReadonlyMap<string, Uint8Array>,
): Promise<FileRestoreSummary> {
  let restored = 0;
  let alreadyHere = 0;
  let notInZip = 0;
  let damaged = 0;
  for (const row of backup.tables.attachments as readonly BackupRow[]) {
    const id = String(row['id']);
    const data = fromZip.get(id);
    if (!data) {
      notInZip += 1;
      continue;
    }
    const expected = String(row['sha256'] ?? '');
    const size = Number(row['size_bytes'] ?? -1);
    if (data.length !== size || (expected !== '' && (await sha256Hex(data)) !== expected)) {
      damaged += 1;
      continue;
    }
    if (await files.get(id as AttachmentId)) {
      alreadyHere += 1;
      continue;
    }
    await files.put(id as AttachmentId, new Blob([data as BlobPart]));
    restored += 1;
  }
  return { restored, alreadyHere, notInZip, damaged };
}
