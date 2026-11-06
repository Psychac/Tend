import { getAssetMeasurementHistory, type MeasurementSeries } from '@tend/application';
import type { AssetId, LocalDate } from '@tend/domain';
import { localDateOf } from '@tend/domain';
import { deviceTimeZone, formatDate, useLiveQuery } from '../../shared/hooks';

const W = 320;
const H = 90;
const PAD = 8;

const day = (instant: string): LocalDate => localDateOf(instant as never, deviceTimeZone());
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** A plain line chart of one numeric series. Time runs left to right, spaced by date. */
function Trend({ series }: { series: MeasurementSeries }) {
  const pts = series.points.filter((p) => p.value !== undefined);
  const values = pts.map((p) => p.value as number);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const t0 = Date.parse(pts[0]!.measuredAt);
  const t1 = Date.parse(pts.at(-1)!.measuredAt);
  const x = (t: number) => (t1 === t0 ? W / 2 : PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD));
  const y = (v: number) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD));
  const path = pts
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${x(Date.parse(p.measuredAt)).toFixed(1)},${y(p.value as number).toFixed(1)}`,
    )
    .join(' ');
  const summary = `${series.key} from ${fmt(values[0]!)} to ${fmt(values.at(-1)!)} ${series.unit ?? ''}, low ${fmt(lo)}, high ${fmt(hi)}, ${pts.length} readings`;
  return (
    <svg
      role="img"
      aria-label={summary}
      viewBox={`0 0 ${W} ${H}`}
      className="h-24 w-full max-w-md text-brand"
    >
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="stroke-current opacity-20" />
      {pts.length > 1 ? (
        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      ) : null}
      {pts.map((p) => (
        <circle
          key={p.id}
          cx={x(Date.parse(p.measuredAt))}
          cy={y(p.value as number)}
          r={p.withService ? 4 : 3}
          fill={p.withService ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

function SeriesView({ series }: { series: MeasurementSeries }) {
  const newestFirst = [...series.points].reverse();
  const values = series.points.flatMap((p) => (p.value === undefined ? [] : [p.value]));
  return (
    <section aria-label={`${series.key} history`} className="space-y-2">
      <h4 className="text-sm font-medium">
        <span className="capitalize">{series.key}</span>
        {series.kind === 'numeric' ? ` (${series.unit})` : ' (rating)'}
      </h4>
      {series.kind === 'numeric' ? (
        <>
          <Trend series={series} />
          <p className="text-xs text-muted">
            Latest {fmt(values.at(-1)!)} {series.unit}
            {values.length > 1
              ? ` · low ${fmt(Math.min(...values))} · high ${fmt(Math.max(...values))}`
              : ''}
            {' · filled dots were recorded with a service'}
          </p>
        </>
      ) : null}
      <ul className="max-h-48 divide-y divide-line overflow-auto text-sm">
        {newestFirst.map((p) => (
          <li key={p.id} className="flex justify-between gap-3 py-1">
            <span>
              {series.kind === 'numeric' ? `${fmt(p.value!)} ${series.unit}` : p.label}
              {p.withService ? <span className="text-muted"> · with service</span> : null}
            </span>
            <span className="text-muted">{formatDate(day(p.measuredAt))}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Every reading recorded for an asset, as a trend for numbers and a timeline for ratings. */
export function MeasurementHistory({ assetId, label }: { assetId: AssetId; label: string }) {
  const history = useLiveQuery(({ repos }) => getAssetMeasurementHistory(repos, assetId), assetId);
  return (
    <div
      aria-label={`Readings for ${label}`}
      role="region"
      className="mt-3 space-y-4 border-t border-line pt-3"
    >
      {history.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {history.status === 'error' ? (
        <p role="alert" className="text-danger">
          Could not load readings: {history.message}
        </p>
      ) : null}
      {history.status === 'ready' && history.data.length === 0 ? (
        <p className="text-sm text-muted">No readings yet. Use “Record a reading”.</p>
      ) : null}
      {history.status === 'ready'
        ? history.data.map((s) => <SeriesView key={`${s.kind}:${s.key}`} series={s} />)
        : null}
    </div>
  );
}
