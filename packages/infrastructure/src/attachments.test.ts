import { addAttachment, createAsset, listAttachments, type Deps } from '@tend/application';
import type { Clock, Id, IdGenerator, Instant, Result, UserId } from '@tend/domain';
import { createMemoryAttachmentStorage } from './attachment-files';
import { exportBackup, parseBackup, restoreBackup } from './backup';
import { createSqlRepositories, createSqlUnitOfWork } from './sql-repositories';
import { createNodeSqliteDatabase } from './testing/node-sqlite';

const OWNER = '00000000-0000-4000-8000-000000000001' as UserId;
const NOW = '2026-11-05T06:30:00.000Z' as Instant;

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

function setup() {
  const db = createNodeSqliteDatabase();
  let n = 0;
  const ids: IdGenerator = {
    next<K extends string>(): Id<K> {
      n += 1;
      return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}` as Id<K>;
    },
  };
  const clock: Clock = { now: () => NOW };
  const files = createMemoryAttachmentStorage();
  const deps: Deps = { ownerId: OWNER, clock, ids, uow: createSqlUnitOfWork(db), files };
  return { db, deps, files, repos: createSqlRepositories(db) };
}

describe('attachments in SQL', () => {
  it('round-trips a record and lists by subject, oldest first', async () => {
    const { deps, repos, files } = setup();
    const asset = must(await createAsset(deps, { name: 'Water heater' }));
    const other = must(await createAsset(deps, { name: 'Car' }));
    const subject = { type: 'asset' as const, id: asset.id };
    const a = must(
      await addAttachment(deps, {
        subject,
        file: { name: 'invoice.pdf', type: 'application/pdf', data: new Blob(['one']) },
      }),
    );
    must(
      await addAttachment(deps, {
        subject: { type: 'asset', id: other.id },
        file: { name: 'other.pdf', type: 'application/pdf', data: new Blob(['two']) },
      }),
    );

    expect(await repos.attachments.getById(a.id)).toEqual(a);
    const items = await listAttachments(repos, files, subject);
    expect(items.map((i) => i.attachment.fileName)).toEqual(['invoice.pdf']);
  });

  it('is in backups as metadata only, and a restore elsewhere shows the file as missing', async () => {
    const source = setup();
    const asset = must(await createAsset(source.deps, { name: 'Water heater' }));
    const subject = { type: 'asset' as const, id: asset.id };
    const a = must(
      await addAttachment(source.deps, {
        subject,
        file: { name: 'invoice.pdf', type: 'application/pdf', data: new Blob(['SECRET-PAYLOAD']) },
      }),
    );

    const backup = await exportBackup(source.db, NOW);
    expect(backup.counts.attachments).toBe(1);
    expect(JSON.stringify(backup)).not.toContain('SECRET-PAYLOAD');

    const parsed = await parseBackup(JSON.stringify(backup));
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const target = setup();
    const outcome = await restoreBackup(target.db, parsed.backup, 'merge');
    expect(outcome.ok).toBe(true);

    const items = await listAttachments(target.repos, target.files, subject);
    expect(items).toHaveLength(1);
    expect(items[0]?.attachment.id).toBe(a.id);
    expect(items[0]?.available).toBe(false);
  });
});
