import type { Repositories } from '@upkeep/contracts';
import {
  createAsset as createAssetEntity,
  err,
  invariantError,
  ok,
  parseLocalDate,
  touch,
  validationError,
  type Asset,
  type AssetStatus,
  type LocalDate,
  type Measurement,
  type Money,
  type Result,
} from '@upkeep/domain';
import { auditEvent, found, transact, type Deps } from './deps';

export interface CreateAssetInput {
  readonly name: string;
  readonly notes?: string | undefined;
  readonly vendor?: string | undefined;
  /** YYYY-MM-DD */
  readonly purchaseDate?: string | undefined;
  readonly purchasePrice?: Money | undefined;
  /** YYYY-MM-DD */
  readonly warrantyExpiresOn?: string | undefined;
}

function optionalDate(path: string, raw: string | undefined): Result<LocalDate | undefined> {
  if (raw === undefined || raw === '') return ok(undefined);
  const parsed = parseLocalDate(raw);
  return parsed.ok
    ? ok(parsed.value)
    : err(validationError([{ path, message: 'must be a valid date (YYYY-MM-DD)' }]));
}

export async function createAsset(deps: Deps, input: CreateAssetInput): Promise<Result<Asset>> {
  return transact(deps, async (repos) => {
    const purchaseDate = optionalDate('purchaseDate', input.purchaseDate);
    if (!purchaseDate.ok) return purchaseDate;
    const warrantyExpiresOn = optionalDate('warrantyExpiresOn', input.warrantyExpiresOn);
    if (!warrantyExpiresOn.ok) return warrantyExpiresOn;

    const created = createAssetEntity({
      id: deps.ids.next<'Asset'>(),
      ownerId: deps.ownerId,
      now: deps.clock.now(),
      name: input.name,
      purchase: {
        date: purchaseDate.value,
        price: input.purchasePrice,
        vendor: input.vendor?.trim() || undefined,
      },
      warranty: warrantyExpiresOn.value ? { expiresOn: warrantyExpiresOn.value } : undefined,
      notes: input.notes,
    });
    if (!created.ok) return created;

    await repos.assets.save(created.value);
    await repos.audit.add(
      auditEvent(deps, 'asset', created.value.id, 'created', created.value.name),
    );
    return ok(created.value);
  });
}

/** Moves an asset between active, in storage, retired and disposed. History is kept. */
export async function setAssetStatus(
  deps: Deps,
  input: { assetId: Asset['id']; status: AssetStatus },
): Promise<Result<Asset>> {
  return transact(deps, async (repos) => {
    const loaded = found('Asset', input.assetId, await repos.assets.getById(input.assetId));
    if (!loaded.ok) return loaded;
    if (loaded.value.status === input.status) {
      return err(invariantError(`Asset is already ${input.status.replace('_', ' ')}`));
    }
    const updated: Asset = {
      ...loaded.value,
      meta: touch(loaded.value.meta, deps.clock.now()),
      status: input.status,
    };
    await repos.assets.save(updated);
    await repos.audit.add(
      auditEvent(deps, 'asset', updated.id, 'updated', `${updated.name}: ${input.status}`),
    );
    return ok(updated);
  });
}

export interface AssetListItem {
  readonly asset: Asset;
  readonly activityCount: number;
  /** The most recent numeric reading for each meter on this asset. */
  readonly latestReadings: readonly Measurement[];
}

export interface AssetListOptions {
  readonly search?: string | undefined;
  /** Include retired and disposed assets. Off by default. */
  readonly includeInactive?: boolean | undefined;
}

export async function listAssets(
  repos: Repositories,
  options: AssetListOptions = {},
): Promise<AssetListItem[]> {
  const [assets, activities] = await Promise.all([
    repos.assets.list({ search: options.search }),
    repos.activities.list({}),
  ]);
  const visible = assets.filter(
    (a) => options.includeInactive || a.status === 'active' || a.status === 'in_storage',
  );
  return Promise.all(
    visible.map(async (asset) => {
      const readings = await repos.measurements.list({ assetId: asset.id });
      const latest = new Map<string, Measurement>();
      for (const m of readings) {
        // Newest first, so the first one seen per key is the latest.
        if (m.value.kind === 'numeric' && !latest.has(m.key)) latest.set(m.key, m);
      }
      return {
        asset,
        activityCount: activities.filter((a) => a.assetId === asset.id).length,
        latestReadings: [...latest.values()],
      };
    }),
  );
}
