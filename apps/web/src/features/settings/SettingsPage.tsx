import { useState, type ChangeEvent } from 'react';
import {
  exportBackup,
  parseBackup,
  previewRestore,
  restoreBackup,
  type BackupFile,
  type RestoreMode,
  type RestorePreview,
} from '@tend/infrastructure';
import { NotificationsSection } from './NotificationsSection';
import { StorageSection } from './StorageSection';
import { CategoriesSection, LocationsSection } from './OrganiseSections';
import { CurrencySelect, getDefaultCurrency, setDefaultCurrency } from '../../shared/currency';
import { useApp, useChanges } from '../../app/providers/AppProvider';

const button = 'btn';
const primary = 'btn btn-primary';

/** Hands the browser a file to save. */
function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-xl font-semibold">Settings</h2>
      <CategoriesSection />
      <LocationsSection />
      <NotificationsSection />
      <CurrencySection />
      <StorageSection />
      <BackupSection />
    </div>
  );
}

function CurrencySection() {
  const [currency, setCurrency] = useState(getDefaultCurrency);
  return (
    <section aria-labelledby="currency-heading" className="space-y-2">
      <h3 id="currency-heading" className="text-lg font-medium">
        Currency
      </h3>
      <p className="text-sm text-muted">
        Pre-selected when you enter a cost or price. You can still pick a different currency each
        time, and totals are never mixed across currencies.
      </p>
      <label className="block text-sm">
        Default currency
        <CurrencySelect
          label="Default currency"
          value={currency}
          onChange={(code) => {
            setCurrency(code);
            setDefaultCurrency(code);
          }}
        />
      </label>
    </section>
  );
}

type Restore =
  | { readonly step: 'idle' }
  | { readonly step: 'invalid'; readonly errors: readonly string[] }
  | {
      readonly step: 'preview';
      readonly backup: BackupFile;
      readonly mode: RestoreMode;
      readonly preview: RestorePreview;
    }
  | { readonly step: 'done'; readonly message: string };

const label = (table: string): string => table.replace('_', ' ');

function BackupSection() {
  const { db, deps } = useApp();
  const { notifyChanged } = useChanges();
  const [restore, setRestore] = useState<Restore>({ step: 'idle' });
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState<string | null>(null);

  async function doExport() {
    setBusy(true);
    const backup = await exportBackup(db, deps.clock.now());
    const day = backup.exportedAt.slice(0, 10);
    download(`tend-backup-${day}.json`, JSON.stringify(backup, null, 2));
    setExported(
      `Saved ${backup.counts.activities} activities and ${backup.counts.completions} completions.`,
    );
    setBusy(false);
  }

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const parsed = await parseBackup(await file.text());
    if (!parsed.ok) {
      setRestore({ step: 'invalid', errors: parsed.errors });
    } else {
      const mode: RestoreMode = 'merge';
      setRestore({
        step: 'preview',
        backup: parsed.backup,
        mode,
        preview: await previewRestore(db, parsed.backup, mode),
      });
    }
    setBusy(false);
  }

  async function changeMode(current: Extract<Restore, { step: 'preview' }>, mode: RestoreMode) {
    setRestore({ ...current, mode, preview: await previewRestore(db, current.backup, mode) });
  }

  async function apply(current: Extract<Restore, { step: 'preview' }>) {
    setBusy(true);
    try {
      const outcome = await restoreBackup(db, current.backup, current.mode);
      if (outcome.ok) {
        notifyChanged();
        setRestore({ step: 'done', message: 'Backup restored.' });
      } else {
        setRestore({ step: 'invalid', errors: outcome.errors });
      }
    } catch (e) {
      setRestore({
        step: 'invalid',
        errors: [
          `The restore failed and nothing was changed: ${e instanceof Error ? e.message : String(e)}`,
        ],
      });
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="backup-heading" className="space-y-4">
      <div>
        <h3 id="backup-heading" className="text-lg font-medium">
          Backup and restore
        </h3>
        <p className="text-sm text-muted">
          Everything is stored on this device only. A backup file is your safety net: keep a recent
          one somewhere other than this device.
        </p>
      </div>

      <div>
        <button type="button" className={primary} disabled={busy} onClick={() => void doExport()}>
          Download backup
        </button>
        {exported ? (
          <p role="status" className="mt-2 text-sm text-ok">
            {exported}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium">
          Restore from a backup file
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => void pickFile(e)}
            className="mt-1 block text-sm"
          />
        </label>
      </div>

      {restore.step === 'invalid' ? (
        <div role="alert" className="rounded border border-danger-line bg-danger-soft p-3 text-sm">
          <p className="font-medium text-danger">This backup cannot be restored.</p>
          <ul className="mt-1 list-disc pl-5 text-danger">
            {restore.errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-2 text-danger">Nothing on this device was changed.</p>
        </div>
      ) : null}

      {renderPreview()}

      {restore.step === 'done' ? (
        <p role="status" className="text-sm text-ok">
          {restore.message}
        </p>
      ) : null}
    </section>
  );

  function renderPreview() {
    if (restore.step !== 'preview') return null;
    const current = restore;
    const { preview } = current;
    const blocked = preview.problems.length > 0;
    return (
      <div className="space-y-3 card p-3 text-sm">
        <p className="font-medium">
          Backup from {current.backup.exportedAt.slice(0, 10)} — preview, nothing has changed yet
        </p>

        <fieldset>
          <legend className="font-medium">How to restore</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="mode"
              checked={current.mode === 'merge'}
              onChange={() => void changeMode(current, 'merge')}
            />
            <span>Merge: add what is missing and keep what is already here. Safe to repeat.</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="mode"
              checked={current.mode === 'replace'}
              onChange={() => void changeMode(current, 'replace')}
            />
            <span>
              Replace: make this device match the backup exactly. Anything not in the backup is
              removed.
            </span>
          </label>
        </fieldset>

        <table className="w-full text-left">
          <thead>
            <tr>
              <th className="py-1 font-medium">Records</th>
              <th className="py-1 font-medium">Added</th>
              <th className="py-1 font-medium">
                {current.mode === 'merge' ? 'Already here' : 'Removed'}
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.tables
              .filter((t) => t.add + t.alreadyPresent + t.remove > 0)
              .map((t) => (
                <tr key={t.table}>
                  <td className="py-0.5 capitalize">{label(t.table)}</td>
                  <td>{t.add}</td>
                  <td>{current.mode === 'merge' ? t.alreadyPresent : t.remove}</td>
                </tr>
              ))}
          </tbody>
        </table>

        {blocked ? (
          <div role="alert" className="text-danger">
            <p className="font-medium">This restore would leave broken links:</p>
            <ul className="list-disc pl-5">
              {preview.problems.slice(0, 5).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            className={primary}
            disabled={busy || blocked}
            onClick={() => void apply(current)}
          >
            {current.mode === 'replace' ? 'Replace my data' : 'Merge into my data'}
          </button>
          <button type="button" className={button} onClick={() => setRestore({ step: 'idle' })}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
}
