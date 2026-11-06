import { useState } from 'react';
import { exportBackup } from '@tend/infrastructure';
import { useOptionalApp } from '../../app/providers/AppProvider';
import { formatDiagnostics } from '../../shared/diagnostics';
import { collectDiagnostics } from './useDiagnostics';

/** Copies text, or reports that the browser would not let it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Shown when a screen (or the whole app) fails. It never assumes the app is healthy: the data
 * is stored separately and is probably fine, so it offers a backup first, then a reload. It
 * works when the database is not open (the backup button then does not appear).
 */
export function ErrorFallback({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const app = useOptionalApp();
  const [note, setNote] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  async function backup() {
    if (!app) return;
    try {
      const file = await exportBackup(app.db, app.deps.clock.now());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `tend-backup-${file.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNote(
        `Backup saved: ${file.counts.activities} activities and ${file.counts.completions} completions.`,
      );
    } catch (e) {
      setNote(`The backup could not be made: ${reason(e)}`);
    }
  }

  async function copy() {
    let text: string;
    try {
      text = app
        ? formatDiagnostics(await collectDiagnostics(app))
        : `Tend diagnostics\nThe app was not open.\nError: ${reason(error)}`;
    } catch (e) {
      text = `Tend diagnostics\nCould not be collected: ${reason(e)}\nError: ${reason(error)}`;
    }
    setReport(text);
    setNote(
      (await copyText(text)) ? 'Diagnostics copied.' : 'Copy the diagnostics from the box below.',
    );
  }

  return (
    <div
      role="alert"
      className="m-4 space-y-3 rounded border border-danger-line bg-danger-soft p-4"
    >
      <h2 className="font-semibold text-danger">Something went wrong</h2>
      <p className="text-sm text-danger">
        This screen could not be shown. Your data is stored separately and this did not change it.
        Download a backup if you want to be sure, then reload.
      </p>
      <p className="text-xs text-danger">Details: {reason(error)}</p>
      <div className="flex flex-wrap gap-2">
        {app ? (
          <button type="button" className="btn" onClick={() => void backup()}>
            Download a backup
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => void copy()}>
          Copy diagnostics
        </button>
        {onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <a href="/" className="btn">
          Go to the dashboard
        </a>
      </div>
      {note ? (
        <p role="status" className="text-sm">
          {note}
        </p>
      ) : null}
      {report ? (
        <textarea
          readOnly
          aria-label="Diagnostics"
          value={report}
          rows={8}
          className="field block w-full font-mono text-xs"
        />
      ) : null}
    </div>
  );
}
