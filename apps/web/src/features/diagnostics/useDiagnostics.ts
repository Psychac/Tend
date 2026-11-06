import { attachmentUsage } from '@tend/application';
import {
  BACKUP_SCHEMA_VERSION,
  TABLES,
  latestVersion,
  readSchemaVersion,
} from '@tend/infrastructure';
import type { AppServices } from '../../app/providers/AppProvider';
import {
  APP_BUILD,
  APP_VERSION,
  recentErrors,
  type DiagnosticsData,
} from '../../shared/diagnostics';

/** Gathers versions, record counts, storage and recent errors. Reads only counts, never content. */
export async function collectDiagnostics(app: AppServices): Promise<DiagnosticsData> {
  const counts: Record<string, number> = {};
  for (const table of Object.keys(TABLES)) {
    const rows = await app.db.getAll<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    counts[table] = Number(rows[0]?.n ?? 0);
  }
  const [schemaVersion, storage, attachments] = await Promise.all([
    readSchemaVersion(app.db),
    app.storage.status(),
    attachmentUsage(app.repos),
  ]);
  return {
    generatedAt: app.deps.clock.now(),
    version: APP_VERSION,
    build: APP_BUILD,
    schemaVersion,
    latestSchemaVersion: latestVersion(),
    backupFormatVersion: BACKUP_SCHEMA_VERSION,
    counts,
    storage,
    attachments,
    environment: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      online: navigator.onLine,
      installed:
        typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
    },
    errors: recentErrors(),
  };
}
