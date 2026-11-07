import { useState } from 'react';

/**
 * A Delete button that asks first. `onConfirm` returns an error message to show, or null when
 * it worked (the row then disappears, so nothing more is shown).
 */
export function ConfirmDelete({
  label,
  what,
  onConfirm,
}: {
  /** The thing's name, for screen readers. */
  label: string;
  /** What the person is about to lose, shown in the question. */
  what: string;
  onConfirm: () => Promise<string | null>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <button
        type="button"
        className="btn"
        aria-label={`Delete ${label}`}
        onClick={() => setAsking(true)}
      >
        Delete
      </button>
    );
  }
  return (
    <div role="group" aria-label={`Confirm delete ${label}`} className="w-full space-y-2 text-sm">
      <p>{what}</p>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const message = await onConfirm();
            setBusy(false);
            if (message) setError(message);
          }}
        >
          Yes, delete it
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
