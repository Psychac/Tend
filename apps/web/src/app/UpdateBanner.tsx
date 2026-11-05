interface Props {
  readonly onReload: () => void;
  readonly onDismiss: () => void;
}

/** Offers a newly downloaded version of the app; applying it reloads the page. */
export function UpdateBanner({ onReload, onDismiss }: Props) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 bg-ink p-3 text-sm text-canvas"
    >
      <span>A new version is ready.</span>
      <button
        type="button"
        onClick={onReload}
        className="rounded bg-brand px-3 py-1 font-medium hover:bg-brand-hover"
      >
        Reload to update
      </button>
      <button type="button" onClick={onDismiss} className="rounded px-3 py-1 hover:bg-ink/80">
        Later
      </button>
    </div>
  );
}
