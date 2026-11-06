/**
 * Diagnostics for supportability (G-23, spec 5.1). Everything stays on this device: errors are
 * kept in memory and in this browser's local storage, and nothing is sent anywhere. A report is
 * text the user chooses to copy. It holds counts and versions, never record contents, but error
 * messages are included as the browser or the app wrote them.
 */

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

export interface RecordedError {
  /** ISO timestamp. */
  readonly at: string;
  /** Where it was caught, e.g. "window", "promise", "screen", "reminders". */
  readonly source: string;
  readonly message: string;
  readonly stack?: string | undefined;
}

const KEY = 'tend.errors';
const KEEP = 10;
const MAX_MESSAGE = 300;
const MAX_STACK = 1500;

let recent: RecordedError[] | undefined;

function load(): RecordedError[] {
  if (recent) return recent;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    recent = Array.isArray(parsed) ? (parsed as RecordedError[]).slice(-KEEP) : [];
  } catch {
    recent = [];
  }
  return recent;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(recent ?? []));
  } catch {
    // The errors stay in memory for this session when storage is unavailable or full.
  }
}

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

/** Remembers an error for the diagnostics panel. Never throws. */
export function recordError(source: string, error: unknown, now: Date = new Date()): void {
  try {
    const e = error instanceof Error ? error : undefined;
    const message = e ? e.message || e.name : typeof error === 'string' ? error : String(error);
    const list = load();
    list.push({
      at: now.toISOString(),
      source,
      message: clip(message, MAX_MESSAGE),
      stack: e?.stack ? clip(e.stack, MAX_STACK) : undefined,
    });
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    persist();
  } catch {
    // Reporting a problem must never cause another one.
  }
}

/** Oldest first. */
export const recentErrors = (): readonly RecordedError[] => [...load()];

export function clearRecordedErrors(): void {
  recent = [];
  persist();
}

/** Forgets the in-memory copy so the next read comes from storage; for tests. */
export function resetDiagnosticsForTests(): void {
  recent = undefined;
}

let installed = false;

/** Records errors nothing else caught. Safe to call more than once. */
export function installGlobalErrorHandlers(target: Window = window): void {
  if (installed) return;
  installed = true;
  target.addEventListener('error', (e) => recordError('window', e.error ?? e.message));
  target.addEventListener('unhandledrejection', (e) => recordError('promise', e.reason));
}

export interface DiagnosticsData {
  readonly generatedAt: string;
  readonly version: string;
  readonly build: string;
  readonly schemaVersion: number;
  readonly latestSchemaVersion: number;
  readonly backupFormatVersion: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly storage: {
    readonly persistence: string;
    readonly usedBytes: number | null;
    readonly quotaBytes: number | null;
  };
  readonly attachments: { readonly count: number; readonly totalBytes: number };
  readonly environment: {
    readonly userAgent: string;
    readonly language: string;
    readonly timeZone: string;
    readonly online: boolean;
    readonly installed: boolean;
  };
  readonly errors: readonly RecordedError[];
}

const bytes = (n: number | null): string =>
  n === null
    ? 'unknown'
    : n < 1024 * 1024
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** The plain-text report a person can paste into a message. */
export function formatDiagnostics(d: DiagnosticsData): string {
  const lines = [
    'Tend diagnostics',
    `Generated: ${d.generatedAt}`,
    `App version: ${d.version} (build ${d.build})`,
    `Data format on this device: ${d.schemaVersion} (this app understands up to ${d.latestSchemaVersion})`,
    `Backup format: ${d.backupFormatVersion}`,
    `Storage: ${d.storage.persistence}; using ${bytes(d.storage.usedBytes)} of ${bytes(d.storage.quotaBytes)}`,
    `Attached files: ${d.attachments.count} (${bytes(d.attachments.totalBytes)})`,
    `Browser: ${d.environment.userAgent}`,
    `Language: ${d.environment.language}; time zone: ${d.environment.timeZone}`,
    `Online: ${d.environment.online ? 'yes' : 'no'}; installed as an app: ${d.environment.installed ? 'yes' : 'no'}`,
    '',
    'Records:',
    ...Object.entries(d.counts).map(([table, n]) => `  ${table}: ${n}`),
    '',
    d.errors.length === 0
      ? 'Recent errors: none'
      : `Recent errors (${d.errors.length}, oldest first):`,
    ...d.errors.flatMap((e) => [
      `  ${e.at} [${e.source}] ${e.message}`,
      ...(e.stack
        ? e.stack
            .split('\n')
            .slice(0, 4)
            .map((l) => `      ${l.trim()}`)
        : []),
    ]),
  ];
  return lines.join('\n');
}
