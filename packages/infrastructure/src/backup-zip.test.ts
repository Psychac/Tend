import { addAttachment, createAsset, listAttachments, type Deps } from '@tend/application';
import type { Clock, Id, IdGenerator, Instant, Result, UserId } from '@tend/domain';
import { createMemoryAttachmentStorage } from './attachment-files';
import { parseBackup, restoreBackup } from './backup';
import { exportBackupZip, readBackupZip, restoreBackupFiles } from './backup-zip';
import { createSqlRepositories, createSqlUnitOfWork } from './sql-repositories';
import { createNodeSqliteDatabase } from './testing/node-sqlite';
import { createZip, readZip } from './zip';

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

const bytes = (s: string) => new TextEncoder().encode(s);

describe('zip', () => {
  it('round-trips entries and detects corruption', async () => {
    const blob = createZip([
      { name: 'a.txt', data: bytes('hello') },
      { name: 'files/empty', data: bytes('') },
    ]);
    const data = new Uint8Array(await blob.arrayBuffer());
    const r = readZip(data);
    if (!r.ok) throw new Error(r.error);
    expect(new TextDecoder().decode(r.entries.get('a.txt'))).toBe('hello');
    expect(r.entries.has('files/empty')).toBe(true);

    const bad = data.slice();
    bad[36] = (bad[36] ?? 0) ^ 0xff; // inside the first entry's bytes
    expect(readZip(bad).ok).toBe(false);
    expect(readZip(bytes('not a zip')).ok).toBe(false);
  });
});

describe('backup with files', () => {
  async function source() {
    const s = setup();
    const asset = must(await createAsset(s.deps, { name: 'Water heater' }));
    const subject = { type: 'asset' as const, id: asset.id };
    const a = must(
      await addAttachment(s.deps, {
        subject,
        file: { name: 'invoice.pdf', type: 'application/pdf', data: new Blob(['PAYLOAD']) },
      }),
    );
    return { ...s, subject, a };
  }

  async function transfer(s: Awaited<ReturnType<typeof source>>) {
    const out = await exportBackupZip(s.db, s.files, NOW);
    const read = readBackupZip(new Uint8Array(await out.zip.arrayBuffer()));
    if (!read.ok) throw new Error(read.error);
    const parsed = await parseBackup(read.backupText);
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    const target = setup();
    expect((await restoreBackup(target.db, parsed.backup, 'merge')).ok).toBe(true);
    return { out, read, parsed, target };
  }

  it('carries the files to another device', async () => {
    const s = await source();
    const { out, read, parsed, target } = await transfer(s);
    expect(out).toMatchObject({ included: 1, missing: 0 });
    const summary = await restoreBackupFiles(target.files, parsed.backup, read.files);
    expect(summary).toMatchObject({ restored: 1, damaged: 0, notInZip: 0 });
    const items = await listAttachments(target.repos, target.files, s.subject);
    expect(items[0]?.available).toBe(true);
    expect(await (await target.files.get(s.a.id))!.text()).toBe('PAYLOAD');
  });

  it('leaves a file missing when its bytes were not on the source device', async () => {
    const s = await source();
    await s.files.remove(s.a.id);
    const { out, read, parsed, target } = await transfer(s);
    expect(out).toMatchObject({ included: 0, missing: 1 });
    const summary = await restoreBackupFiles(target.files, parsed.backup, read.files);
    expect(summary).toMatchObject({ restored: 0, notInZip: 1 });
    const items = await listAttachments(target.repos, target.files, s.subject);
    expect(items[0]?.available).toBe(false);
  });

  it('does not restore a file that fails its hash', async () => {
    const s = await source();
    const { read, parsed, target } = await transfer(s);
    const tampered = new Map(read.files);
    tampered.set(s.a.id, bytes('XAYLOAD'));
    const summary = await restoreBackupFiles(target.files, parsed.backup, tampered);
    expect(summary).toMatchObject({ restored: 0, damaged: 1 });
    expect(await target.files.get(s.a.id)).toBeNull();
  });

  it('keeps a file already on the device', async () => {
    const s = await source();
    const { read, parsed, target } = await transfer(s);
    await target.files.put(s.a.id, new Blob(['PAYLOAD']));
    const summary = await restoreBackupFiles(target.files, parsed.backup, read.files);
    expect(summary).toMatchObject({ restored: 0, alreadyHere: 1 });
  });

  it('rejects a zip that is not a Tend backup', async () => {
    const zip = createZip([{ name: 'other.txt', data: bytes('x') }]);
    expect(readBackupZip(new Uint8Array(await zip.arrayBuffer())).ok).toBe(false);
  });
});
