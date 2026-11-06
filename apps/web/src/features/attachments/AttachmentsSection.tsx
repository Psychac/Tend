import { useState, type ChangeEvent } from 'react';
import {
  addAttachment,
  listAttachments,
  readAttachment,
  removeAttachment,
  type AttachmentItem,
} from '@tend/application';
import { MAX_ATTACHMENT_BYTES, type AttachmentSubject } from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, useAction, useLiveQuery } from '../../shared/hooks';

/** Types a browser can show without running anything. SVG and HTML can run script, so they download. */
const SAFE_TO_SHOW = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
]);

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Hands the browser a file: shown in a new tab if that is safe, otherwise saved. */
function deliver(data: Blob, name: string, mimeType: string): void {
  const show = SAFE_TO_SHOW.has(mimeType);
  const url = URL.createObjectURL(
    new Blob([data], { type: show ? mimeType : 'application/octet-stream' }),
  );
  const link = document.createElement('a');
  link.href = url;
  if (show) {
    link.target = '_blank';
    link.rel = 'noopener';
  } else {
    link.download = name;
  }
  link.click();
  // The new tab needs the URL for a moment; revoke it later.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

interface Props {
  readonly subject: AttachmentSubject;
  /** Names the section for screen readers, for example "Water heater". */
  readonly label: string;
}

/** Lists, adds, opens and removes the files attached to one asset, activity or completion. */
export function AttachmentsSection({ subject, label }: Props) {
  const { deps, repos } = useApp();
  const act = useAction();
  const items = useLiveQuery(
    ({ repos: r, deps: d }) => listAttachments(r, d.files, subject),
    `attachments-${subject.type}-${subject.id}`,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await act(() =>
        addAttachment(deps, {
          subject,
          file: { name: file.name, type: file.type, data: file },
        }),
      );
      if (!result.ok) setError(describeError(result.error));
    } catch (e) {
      // Storage full or unavailable: nothing was kept.
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function open(item: AttachmentItem) {
    setError(null);
    const result = await readAttachment(repos, deps.files, item.attachment.id);
    if (!result.ok) setError(describeError(result.error));
    else deliver(result.value.data, item.attachment.fileName, item.attachment.mimeType);
  }

  async function remove(item: AttachmentItem) {
    setBusy(true);
    setError(null);
    const result = await act(() => removeAttachment(deps, { attachmentId: item.attachment.id }));
    if (!result.ok) setError(describeError(result.error));
    setConfirming(null);
    setBusy(false);
  }

  const list = items.status === 'ready' ? items.data : [];

  return (
    <section aria-label={`Files for ${label}`} className="mt-3 space-y-2 border-t border-line pt-3">
      {items.status === 'error' ? (
        <p role="alert" className="text-sm text-danger">
          Could not load files: {items.message}
        </p>
      ) : null}

      {list.length === 0 && items.status === 'ready' ? (
        <p className="text-sm text-muted">No files attached.</p>
      ) : null}

      <ul className="space-y-1.5">
        {list.map((item) => (
          <li key={item.attachment.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{item.attachment.fileName}</span>
            <span className="text-muted">{sizeText(item.attachment.sizeBytes)}</span>
            {item.available ? null : (
              <span className="badge bg-warn-soft text-warn">File missing on this device</span>
            )}
            <span className="ml-auto flex gap-2">
              {item.available ? (
                <button
                  type="button"
                  className="btn"
                  aria-label={`Open ${item.attachment.fileName}`}
                  onClick={() => void open(item)}
                >
                  Open
                </button>
              ) : null}
              {confirming === item.attachment.id ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    aria-label={`Confirm remove ${item.attachment.fileName}`}
                    onClick={() => void remove(item)}
                  >
                    Yes, remove
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove ${item.attachment.fileName}`}
                  onClick={() => setConfirming(item.attachment.id)}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <label className="block text-sm font-medium">
        Add a file
        <input
          type="file"
          disabled={busy}
          onChange={(e) => void pick(e)}
          className="mt-1 block text-sm"
        />
      </label>
      <p className="text-xs text-muted">
        Up to {MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB each. Files stay on this device and are not
        in a backup unless you include them.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
