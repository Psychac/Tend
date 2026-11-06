import { useState } from 'react';
import { useApp } from '../../app/providers/AppProvider';
import {
  clearRecordedErrors,
  formatDiagnostics,
  type DiagnosticsData,
} from '../../shared/utilities/diagnostics';
import { useLiveQuery } from '../../shared/hooks';
import { copyText } from '../diagnostics/ErrorFallback';
import { collectDiagnostics } from '../diagnostics/useDiagnostics';

/** Versions, record counts and recent errors, for working out what went wrong (G-23). */
export function DiagnosticsSection() {
  const app = useApp();
  const [cleared, setCleared] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const data = useLiveQuery(() => collectDiagnostics(app), `diagnostics-${cleared}`);

  async function copy(d: DiagnosticsData) {
    const ok = await copyText(formatDiagnostics(d));
    setNote(
      ok ? 'Diagnostics copied.' : 'Your browser would not allow copying. Select the text below.',
    );
  }

  return (
    <section aria-labelledby="diagnostics-heading" className="space-y-2">
      <h3 id="diagnostics-heading" className="text-lg font-medium">
        Diagnostics
      </h3>
      <p className="text-sm text-muted">
        Details that help when something is wrong. Nothing is sent anywhere: you choose whether to
        copy it. It lists counts and versions, not your records, but it does include any error
        messages Tend recorded.
      </p>
      {data.status === 'loading' ? <p className="text-sm text-muted">Collecting…</p> : null}
      {data.status === 'error' ? (
        <p role="alert" className="text-sm text-danger">
          Could not collect diagnostics: {data.message}
        </p>
      ) : null}
      {data.status === 'ready' ? (
        <>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">App version</dt>
            <dd>
              {data.data.version} (build {data.data.build})
            </dd>
            <dt className="text-muted">Data format</dt>
            <dd>
              {data.data.schemaVersion} of {data.data.latestSchemaVersion}
            </dd>
            <dt className="text-muted">Records</dt>
            <dd>{Object.values(data.data.counts).reduce((a, b) => a + b, 0)}</dd>
            <dt className="text-muted">Attached files</dt>
            <dd>{data.data.attachments.count}</dd>
            <dt className="text-muted">Recent errors</dt>
            <dd>{data.data.errors.length}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => void copy(data.data)}>
              Copy diagnostics
            </button>
            {data.data.errors.length > 0 ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  clearRecordedErrors();
                  setCleared((n) => n + 1);
                  setNote('Recorded errors cleared.');
                }}
              >
                Clear recorded errors
              </button>
            ) : null}
          </div>
          {note ? (
            <p role="status" className="text-sm">
              {note}
            </p>
          ) : null}
          <details>
            <summary className="cursor-pointer text-sm">Show the full report</summary>
            <textarea
              readOnly
              aria-label="Diagnostics report"
              value={formatDiagnostics(data.data)}
              rows={12}
              className="field mt-2 block w-full font-mono text-xs"
            />
          </details>
        </>
      ) : null}
    </section>
  );
}
