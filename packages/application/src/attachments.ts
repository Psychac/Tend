import type { AttachmentStorage, Repositories } from '@tend/contracts';
import {
  createAttachment,
  err,
  invariantError,
  notFoundError,
  ok,
  touch,
  validationError,
  type Attachment,
  type AttachmentId,
  type AttachmentSubject,
  type Result,
} from '@tend/domain';
import { auditEvent, found, transact, type Deps } from './deps';

export interface FileInput {
  readonly name: string;
  readonly type: string;
  readonly data: Blob;
}

async function sha256Hex(data: Blob): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await data.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function subjectExists(repos: Repositories, subject: AttachmentSubject): Promise<boolean> {
  switch (subject.type) {
    case 'asset':
      return (await repos.assets.getById(subject.id as never)) !== null;
    case 'activity':
      return (await repos.activities.getById(subject.id as never)) !== null;
    case 'completion':
      return (await repos.completions.getById(subject.id as never)) !== null;
  }
}

/**
 * Attaches a file to an asset, activity or completion. The bytes are written first and the
 * record second, so a failure never leaves a record pointing at nothing; a leftover file is
 * removed here, or by `sweepOrphanFiles` if even that fails. If the device is full the write
 * rejects with the storage error and nothing is recorded.
 */
export async function addAttachment(
  deps: Deps,
  input: { subject: AttachmentSubject; file: FileInput },
): Promise<Result<Attachment>> {
  const size = input.file.data.size;
  const id = deps.ids.next<'Attachment'>();
  const built = createAttachment({
    id,
    ownerId: deps.ownerId,
    now: deps.clock.now(),
    subject: input.subject,
    fileName: input.file.name,
    mimeType: input.file.type,
    sizeBytes: size,
    // Hashing a file that is about to be rejected would be wasted work.
    sha256: size > 0 && size <= MAX_HASHED_BYTES ? await sha256Hex(input.file.data) : '',
  });
  if (!built.ok) return built;

  let written = false;
  try {
    const result = await transact(deps, async (repos) => {
      if (!(await subjectExists(repos, input.subject))) {
        return err(notFoundError(input.subject.type, input.subject.id));
      }
      await deps.files.put(id, input.file.data);
      written = true;
      await repos.attachments.save(built.value);
      await repos.audit.add(auditEvent(deps, 'attachment', id, 'created', built.value.fileName));
      return ok(built.value);
    });
    if (!result.ok && written) await deps.files.remove(id).catch(() => undefined);
    return result;
  } catch (e) {
    if (written) await deps.files.remove(id).catch(() => undefined);
    throw e;
  }
}

/** Larger than the 10 MB limit by a margin; bigger files are rejected before hashing. */
const MAX_HASHED_BYTES = 11 * 1024 * 1024;

/** Removes the record and then the file. A file that cannot be removed now is swept later. */
export async function removeAttachment(
  deps: Deps,
  input: { attachmentId: AttachmentId },
): Promise<Result<void>> {
  const result = await transact(deps, async (repos) => {
    const loaded = found(
      'Attachment',
      input.attachmentId,
      await repos.attachments.getById(input.attachmentId),
    );
    if (!loaded.ok) return loaded;
    await repos.attachments.delete(input.attachmentId);
    await repos.audit.add(
      auditEvent(deps, 'attachment', input.attachmentId, 'deleted', loaded.value.fileName),
    );
    return ok(undefined);
  });
  if (result.ok) await deps.files.remove(input.attachmentId).catch(() => undefined);
  return result;
}

export interface AttachmentItem {
  readonly attachment: Attachment;
  /** False when the record exists but its file is not on this device. */
  readonly available: boolean;
}

export async function listAttachments(
  repos: Repositories,
  files: AttachmentStorage,
  subject: AttachmentSubject,
): Promise<AttachmentItem[]> {
  const [records, stored] = await Promise.all([
    repos.attachments.listBySubject(subject),
    files.list(),
  ]);
  const present = new Set<string>(stored.map((f) => f.id));
  return records.map((attachment) => ({ attachment, available: present.has(attachment.id) }));
}

/** The file for opening or downloading, checked against its recorded hash. */
export async function readAttachment(
  repos: Repositories,
  files: AttachmentStorage,
  id: AttachmentId,
): Promise<Result<{ attachment: Attachment; data: Blob }>> {
  const attachment = found('Attachment', id, await repos.attachments.getById(id));
  if (!attachment.ok) return attachment;
  const data = await files.get(id);
  if (!data) return err(invariantError(`${attachment.value.fileName} is not on this device`));
  if (attachment.value.sha256 && (await sha256Hex(data)) !== attachment.value.sha256) {
    return err(
      validationError([{ path: 'file', message: `${attachment.value.fileName} is damaged` }]),
    );
  }
  return ok({ attachment: attachment.value, data });
}

/** Files younger than this are never swept: their record may still be on its way. */
const SWEEP_GRACE_MS = 60 * 60 * 1000;

/** Removes stored files that no record refers to, such as ones left by an interrupted attach. */
export async function sweepOrphanFiles(
  repos: Repositories,
  files: AttachmentStorage,
  nowMs: number,
): Promise<number> {
  const known = new Set<string>((await repos.attachments.list()).map((a) => a.id));
  let removed = 0;
  for (const file of await files.list()) {
    if (known.has(file.id) || nowMs - file.modifiedAt < SWEEP_GRACE_MS) continue;
    await files.remove(file.id);
    removed += 1;
  }
  return removed;
}

/** Keeps a completion's files with it when a correction replaces the completion. */
export async function moveAttachments(
  deps: Deps,
  repos: Repositories,
  from: AttachmentSubject,
  to: AttachmentSubject,
): Promise<void> {
  for (const a of await repos.attachments.listBySubject(from)) {
    await repos.attachments.save({ ...a, subject: to, meta: touch(a.meta, deps.clock.now()) });
  }
}

/** How many files are attached and how much room they take, from the records. */
export async function attachmentUsage(
  repos: Repositories,
): Promise<{ count: number; totalBytes: number }> {
  const all = await repos.attachments.list();
  return { count: all.length, totalBytes: all.reduce((sum, a) => sum + a.sizeBytes, 0) };
}
