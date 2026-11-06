import { MAX_ATTACHMENT_BYTES, type Result } from '@tend/domain';
import {
  addAttachment,
  correctCompletion,
  createActivity,
  createAsset,
  listAttachments,
  readAttachment,
  removeAttachment,
  sweepOrphanFiles,
  completeOccurrence,
} from './index';
import { createHarness } from './testing/harness';

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const file = (name = 'receipt.pdf', body = 'hello', type = 'application/pdf') => ({
  name,
  type,
  data: new Blob([body], { type }),
});

async function assetSubject(h = createHarness()) {
  const asset = must(await createAsset(h.deps, { name: 'Water heater' }));
  return { h, subject: { type: 'asset' as const, id: asset.id } };
}

describe('attachments', () => {
  it('stores the file and its record, and lists it as available', async () => {
    const { h, subject } = await assetSubject();
    const a = must(await addAttachment(h.deps, { subject, file: file() }));
    expect(a).toMatchObject({ fileName: 'receipt.pdf', sizeBytes: 5, status: 'uploaded' });
    expect(a.sha256).toHaveLength(64);
    expect(h.files.size()).toBe(1);
    const items = await listAttachments(h.repos, h.files, subject);
    expect(items).toEqual([{ attachment: a, available: true }]);
  });

  it('rejects empty and oversized files without storing anything', async () => {
    const { h, subject } = await assetSubject();
    const empty = await addAttachment(h.deps, { subject, file: file('a.txt', '') });
    expect(empty.ok).toBe(false);
    const big = await addAttachment(h.deps, {
      subject,
      file: {
        name: 'big.bin',
        type: '',
        data: new Blob([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)]),
      },
    });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(JSON.stringify(big.error)).toMatch(/too large/);
    expect(h.files.size()).toBe(0);
    expect(await h.repos.attachments.list()).toEqual([]);
  });

  it('accepts a file of exactly the limit', async () => {
    const { h, subject } = await assetSubject();
    const r = await addAttachment(h.deps, {
      subject,
      file: { name: 'max.bin', type: '', data: new Blob([new Uint8Array(MAX_ATTACHMENT_BYTES)]) },
    });
    expect(r.ok).toBe(true);
  });

  it('will not attach to something that does not exist', async () => {
    const h = createHarness();
    const r = await addAttachment(h.deps, {
      subject: { type: 'asset', id: 'nope' },
      file: file(),
    });
    expect(r.ok).toBe(false);
    expect(h.files.size()).toBe(0);
  });

  it('keeps data consistent when the device is full: nothing recorded, error surfaces', async () => {
    const { h, subject } = await assetSubject();
    const full = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const deps = { ...h.deps, files: { ...h.files, put: () => Promise.reject(full) } };
    await expect(addAttachment(deps, { subject, file: file() })).rejects.toBe(full);
    expect(await h.repos.attachments.list()).toEqual([]);
    expect(h.files.size()).toBe(0);
  });

  it('removes the file again if recording it fails', async () => {
    const { h, subject } = await assetSubject();
    const boom = new Error('db failed');
    const broken = {
      ...h.deps,
      uow: {
        run: <T>(work: Parameters<typeof h.deps.uow.run<T>>[0]) =>
          h.deps.uow.run((repos) =>
            work({
              ...repos,
              attachments: { ...repos.attachments, save: () => Promise.reject(boom) },
            }),
          ),
      },
    };
    await expect(addAttachment(broken, { subject, file: file() })).rejects.toBe(boom);
    expect(h.files.size()).toBe(0);
  });

  it('reads a file back, and notices damage and missing bytes', async () => {
    const { h, subject } = await assetSubject();
    const a = must(await addAttachment(h.deps, { subject, file: file('a.pdf', 'original') }));
    const read = must(await readAttachment(h.repos, h.files, a.id));
    expect(await read.data.text()).toBe('original');

    await h.files.put(a.id, new Blob(['tampered']));
    const damaged = await readAttachment(h.repos, h.files, a.id);
    expect(damaged.ok).toBe(false);
    if (!damaged.ok) expect(JSON.stringify(damaged.error)).toMatch(/damaged/);

    await h.files.remove(a.id);
    const missing = await readAttachment(h.repos, h.files, a.id);
    expect(missing.ok).toBe(false);
    expect(await listAttachments(h.repos, h.files, subject)).toMatchObject([{ available: false }]);
  });

  it('removes both the record and the file', async () => {
    const { h, subject } = await assetSubject();
    const a = must(await addAttachment(h.deps, { subject, file: file() }));
    must(await removeAttachment(h.deps, { attachmentId: a.id }));
    expect(await listAttachments(h.repos, h.files, subject)).toEqual([]);
    expect(h.files.size()).toBe(0);
    expect((await removeAttachment(h.deps, { attachmentId: a.id })).ok).toBe(false);
  });

  it('sweeps files with no record, but spares recent ones', async () => {
    const { h, subject } = await assetSubject();
    const kept = must(await addAttachment(h.deps, { subject, file: file() }));
    const orphan = '00000000-0000-4000-8000-0000000000ff' as typeof kept.id;
    await h.files.put(orphan, new Blob(['x']));
    const start = Date.parse(h.clock.now());
    const soon = start + 5 * 60 * 1000;
    expect(await sweepOrphanFiles(h.repos, h.files, soon)).toBe(0);
    const later = start + 2 * 60 * 60 * 1000;
    expect(await sweepOrphanFiles(h.repos, h.files, later)).toBe(1);
    expect(await h.files.get(orphan)).toBeNull();
    expect(await h.files.get(kept.id)).not.toBeNull();
  });

  it('follows a completion when a correction replaces it', async () => {
    const h = createHarness();
    const a = must(
      await createActivity(h.deps, {
        name: 'Water plants',
        type: 'routine',
        schedule: {
          strategy: { kind: 'calendar', interval: { every: 1, unit: 'day' } },
          timeZone: 'Asia/Kolkata',
          startsOn: '2026-11-05',
        },
      }),
    );
    const done = must(await completeOccurrence(h.deps, { occurrenceId: a.occurrences[0]!.id }));
    const subject = { type: 'completion' as const, id: done.completion.id };
    must(await addAttachment(h.deps, { subject, file: file() }));

    const corrected = must(
      await correctCompletion(h.deps, {
        completionId: done.completion.id,
        details: { notes: 'fixed' },
      }),
    );
    expect(await listAttachments(h.repos, h.files, subject)).toEqual([]);
    const moved = await listAttachments(h.repos, h.files, {
      type: 'completion',
      id: corrected.completion.id,
    });
    expect(moved).toHaveLength(1);
    expect(moved[0]?.available).toBe(true);
  });
});
