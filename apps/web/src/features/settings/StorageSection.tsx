import { useEffect, useState } from 'react';
import { attachmentUsage } from '@tend/application';
import { useApp } from '../../app/providers/AppProvider';
import { useLiveQuery } from '../../shared/hooks';
import { formatBytes, type StorageStatus } from '../../shared/utilities/storage';

/** Whether the browser has promised to keep this device's data, and how much room is used.
 * That is about data loss only; it says nothing about who can read the data (G-19). */
export function StorageSection() {
  const { storage } = useApp();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const usage = useLiveQuery(({ repos }) => attachmentUsage(repos), 'attachment-usage');

  useEffect(() => {
    let live = true;
    void storage.status().then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, [storage]);

  async function protect() {
    await storage.requestPersistence();
    setStatus(await storage.status());
  }

  return (
    <section aria-labelledby="storage-heading" className="space-y-2">
      <h3 id="storage-heading" className="text-lg font-medium">
        Storage
      </h3>
      {status === null ? (
        <p className="text-sm text-muted">Checking storage…</p>
      ) : (
        <>
          <p role="status" className="text-sm">
            {status.persistence === 'persistent'
              ? 'Storage: kept. The browser has agreed not to clear your data automatically.'
              : status.persistence === 'best-effort'
                ? 'Storage: best-effort. The browser may clear your data if the device runs low on space.'
                : 'Storage: this browser cannot report whether it will keep your data.'}
          </p>
          {status.usedBytes !== null && status.quotaBytes !== null ? (
            <p className="text-sm text-muted">
              Using {formatBytes(status.usedBytes)} of about {formatBytes(status.quotaBytes)}{' '}
              available to Tend on this device.
            </p>
          ) : null}
          {usage.status === 'ready' && usage.data.count > 0 ? (
            <p className="text-sm text-muted">
              {usage.data.count} attached {usage.data.count === 1 ? 'file uses' : 'files use'}{' '}
              {formatBytes(usage.data.totalBytes)} of that.
            </p>
          ) : null}
          {status.persistence === 'best-effort' ? (
            <button type="button" className="btn" onClick={() => void protect()}>
              Ask the browser to keep my data
            </button>
          ) : null}
          {status.persistence !== 'persistent' ? (
            <p className="text-sm text-muted">
              Because this is not guaranteed, download a backup below and keep it somewhere other
              than this device.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Even kept storage is never a guarantee: clearing site data or losing the device still
              loses it. Keep a recent backup. This is about not losing data, not about who can read
              it (see Privacy on this device).
            </p>
          )}
        </>
      )}
    </section>
  );
}
