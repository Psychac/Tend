import { useState, type FormEvent } from 'react';
import {
  createAsset,
  listAssets,
  updateAsset,
  recordMeasurement,
  setAssetStatus,
  type AssetListItem,
} from '@upkeep/application';
import { currencyExponent, parseMoney, type Asset } from '@upkeep/domain';
import { MoneyField, useMoneyState } from '../../shared/currency';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, formatDate, useAction, useLiveQuery } from '../../shared/hooks';

const field = 'mt-1 block w-full rounded border border-slate-300 px-2 py-1';
const button =
  'rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50';
const primary =
  'rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50';

export function AssetsPage() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const assets = useLiveQuery(
    ({ repos }) => listAssets(repos, { search, includeInactive: showInactive }),
    `${search}|${showInactive}`,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Assets</h2>
        <button type="button" className={primary} onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : 'Add asset'}
        </button>
      </div>

      {adding ? <AssetForm onDone={() => setAdding(false)} /> : null}

      <input
        type="search"
        placeholder="Search assets"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="block w-full max-w-md rounded border border-slate-300 px-2 py-1"
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Show retired and disposed
      </label>

      {assets.status === 'loading' ? <p className="text-slate-600">Loading…</p> : null}
      {assets.status === 'error' ? (
        <p role="alert" className="text-red-700">
          {assets.message}
        </p>
      ) : null}
      {assets.status === 'ready' && assets.data.length === 0 ? (
        <p className="text-slate-600">
          {search ? 'No assets match your search.' : 'No assets yet. Add a car, appliance or tool.'}
        </p>
      ) : null}
      {assets.status === 'ready' ? (
        <ul className="space-y-3">
          {assets.data.map((item) => (
            <AssetCard key={item.asset.id} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** An amount as the person would type it: 150050 USD minor units is "1500.50". */
function amountText(minor: number, currency: string): string {
  const exponent = currencyExponent(currency);
  return (minor / 10 ** exponent).toFixed(exponent);
}

/** Creates an asset, or edits `asset` when given. */
function AssetForm({ asset, onDone }: { asset?: Asset | undefined; onDone: () => void }) {
  const { deps } = useApp();
  const act = useAction();
  const [name, setName] = useState(asset?.name ?? '');
  const [vendor, setVendor] = useState(asset?.purchase.vendor ?? '');
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase.date ?? '');
  const [price, setPrice] = useMoneyState(
    asset?.purchase.price
      ? {
          amount: amountText(asset.purchase.price.minor, asset.purchase.price.currency),
          currency: asset.purchase.price.currency,
        }
      : undefined,
  );
  const [warranty, setWarranty] = useState(asset?.warranty?.expiresOn ?? '');
  const [notes, setNotes] = useState(asset?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedPrice = price.amount.trim() ? parseMoney(price.amount, price.currency) : undefined;
    if (parsedPrice && !parsedPrice.ok) {
      setError(describeError(parsedPrice.error));
      return;
    }
    setBusy(true);
    const details = {
      name,
      vendor,
      notes,
      purchaseDate,
      warrantyExpiresOn: warranty,
      purchasePrice: parsedPrice?.ok ? parsedPrice.value : undefined,
    };
    const result = await act(() =>
      asset ? updateAsset(deps, { assetId: asset.id, ...details }) : createAsset(deps, details),
    );
    setBusy(false);
    if (result.ok) onDone();
    else setError(describeError(result.error));
  }

  return (
    <form
      onSubmit={submit}
      aria-label={asset ? `Edit ${asset.name}` : 'New asset'}
      className="max-w-xl space-y-3 rounded border border-slate-200 bg-white p-3"
    >
      <label className="block text-sm">
        Name
        <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Bought from
          <input value={vendor} onChange={(e) => setVendor(e.target.value)} className={field} />
        </label>
        <MoneyField label="Price" value={price} onChange={setPrice} />
        <label className="block text-sm">
          Purchase date
          <input
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={field}
          />
        </label>
        <label className="block text-sm">
          Warranty ends
          <input
            type="date"
            value={warranty}
            onChange={(e) => setWarranty(e.target.value)}
            className={field}
          />
        </label>
      </div>
      <label className="block text-sm">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={primary}>
        {asset ? 'Save changes' : 'Save asset'}
      </button>
    </form>
  );
}

function AssetCard({ item }: { item: AssetListItem }) {
  const { deps } = useApp();
  const act = useAction();
  const { asset } = item;
  const [reading, setReading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState(item.latestReadings[0]?.key ?? 'odometer');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState(
    item.latestReadings[0]?.value.kind === 'numeric'
      ? item.latestReadings[0].value.quantity.unit
      : 'km',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitReading(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await act(() =>
      recordMeasurement(deps, {
        assetId: asset.id,
        measurement: { kind: 'numeric', key, value: Number(value), unit },
      }),
    );
    setBusy(false);
    if (result.ok) {
      setValue('');
      setReading(false);
    } else setError(describeError(result.error));
  }

  const inactive = asset.status === 'retired' || asset.status === 'disposed';

  async function toggleActive() {
    setBusy(true);
    setError(null);
    const result = await act(() =>
      setAssetStatus(deps, { assetId: asset.id, status: inactive ? 'active' : 'retired' }),
    );
    setBusy(false);
    if (!result.ok) setError(describeError(result.error));
  }

  return (
    <li className="rounded border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{asset.name}</p>
          <p className="text-sm text-slate-600">
            {item.activityCount} {item.activityCount === 1 ? 'activity' : 'activities'}
            {asset.status !== 'active' ? ` · ${asset.status.replace('_', ' ')}` : ''}
            {asset.warranty ? ` · warranty ends ${formatDate(asset.warranty.expiresOn)}` : ''}
          </p>
          {item.latestReadings.map((m) =>
            m.value.kind === 'numeric' ? (
              <p key={m.id} className="text-sm text-slate-600">
                {m.key}: {m.value.quantity.value} {m.value.quantity.unit}
              </p>
            ) : null,
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={button}
            aria-label={`Edit ${asset.name}`}
            onClick={() => setEditing(!editing)}
          >
            Edit
          </button>
          <button type="button" className={button} onClick={() => setReading(!reading)}>
            Record a reading
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => void toggleActive()}
          >
            {inactive ? 'Reactivate' : 'Retire'}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <AssetForm asset={asset} onDone={() => setEditing(false)} />
        </div>
      ) : null}

      {reading ? (
        <form
          onSubmit={submitReading}
          aria-label={`Reading for ${asset.name}`}
          className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3"
        >
          <label className="block text-sm">
            Meter
            <input
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className={field}
            />
          </label>
          <label className="block text-sm">
            Value
            <input
              required
              type="number"
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={field}
            />
          </label>
          <label className="block text-sm">
            Unit
            <input
              required
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={field}
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
            Save reading
          </button>
        </form>
      ) : null}
    </li>
  );
}
