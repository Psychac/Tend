import { useState, type FormEvent } from 'react';
import {
  createAsset,
  listAssets,
  updateAsset,
  recordMeasurement,
  setAssetStatus,
  type AssetListItem,
} from '@tend/application';
import {
  currencyExponent,
  parseMoney,
  type Asset,
  type CategoryId,
  type LocationId,
} from '@tend/domain';
import { MoneyField, useMoneyState } from '../../shared/currency';
import { CategorySelect, LocationSelect } from '../../shared/pickers';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, formatDate, useAction, useLiveQuery } from '../../shared/hooks';

const field = 'field mt-1 block w-full';
const button =
  'btn';
const primary =
  'btn btn-primary';

export function AssetsPage() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const assets = useLiveQuery(
    ({ repos }) =>
      listAssets(repos, {
        search,
        includeInactive: showInactive,
        categoryId: categoryFilter ? (categoryFilter as CategoryId) : undefined,
        locationId: locationFilter ? (locationFilter as LocationId) : undefined,
      }),
    `${search}|${showInactive}|${categoryFilter}|${locationFilter}`,
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
        className="block w-full max-w-md field"
      />

      <div className="flex flex-wrap gap-4">
        <CategorySelect
          label="Category"
          empty="All categories"
          value={categoryFilter}
          onChange={setCategoryFilter}
          className="mt-1 block field"
        />
        <LocationSelect
          label="Place"
          empty="All places"
          value={locationFilter}
          onChange={setLocationFilter}
          className="mt-1 block field"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Show retired and disposed
      </label>

      {assets.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {assets.status === 'error' ? (
        <p role="alert" className="text-danger">
          {assets.message}
        </p>
      ) : null}
      {assets.status === 'ready' && assets.data.length === 0 ? (
        <p className="text-muted">
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
  const [categoryId, setCategoryId] = useState<string>(asset?.categoryId ?? '');
  const [locationId, setLocationId] = useState<string>(asset?.locationId ?? '');
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
      categoryId: categoryId ? (categoryId as CategoryId) : undefined,
      locationId: locationId ? (locationId as LocationId) : undefined,
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
      className="max-w-xl space-y-3 card p-3"
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
      <div className="flex flex-wrap gap-4">
        <CategorySelect label="Category" value={categoryId} onChange={setCategoryId} />
        <LocationSelect label="Place" value={locationId} onChange={setLocationId} />
      </div>
      <label className="block text-sm">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
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
    <li className="card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{asset.name}</p>
          <p className="text-sm text-muted">
            {item.activityCount} {item.activityCount === 1 ? 'activity' : 'activities'}
            {asset.status !== 'active' ? ` · ${asset.status.replace('_', ' ')}` : ''}
            {asset.warranty ? ` · warranty ends ${formatDate(asset.warranty.expiresOn)}` : ''}
            {item.categoryName ? ` · ${item.categoryName}` : ''}
            {item.locationPath ? ` · ${item.locationPath}` : ''}
          </p>
          {item.latestReadings.map((m) =>
            m.value.kind === 'numeric' ? (
              <p key={m.id} className="text-sm text-muted">
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
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-3 border-t border-line pt-3">
          <AssetForm asset={asset} onDone={() => setEditing(false)} />
        </div>
      ) : null}

      {reading ? (
        <form
          onSubmit={submitReading}
          aria-label={`Reading for ${asset.name}`}
          className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-3"
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
