import { Issues, isNonBlank } from '../core';
import type {
  AssetId,
  CategoryId,
  DomainError,
  Instant,
  LocalDate,
  LocationId,
  Money,
  Result,
  UserId,
} from '../core';
import { addYears } from '../scheduling';
import { newMeta, type EntityMeta } from './meta';

export type AssetCondition = 'good' | 'fair' | 'poor';

export type AssetStatus = 'active' | 'in_storage' | 'retired' | 'disposed';

export interface Warranty {
  readonly expiresOn: LocalDate;
  readonly notes?: string | undefined;
}

export interface PurchaseInfo {
  readonly date?: LocalDate | undefined;
  readonly price?: Money | undefined;
  readonly vendor?: string | undefined;
}

export interface Asset {
  readonly id: AssetId;
  readonly meta: EntityMeta;
  readonly name: string;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly status: AssetStatus;
  readonly purchase: PurchaseInfo;
  readonly warranty?: Warranty | undefined;
  /** How long it is expected to last, in whole years from the purchase date. */
  readonly expectedLifeYears?: number | undefined;
  readonly condition?: AssetCondition | undefined;
  readonly notes?: string | undefined;
}

export interface NewAsset {
  readonly id: AssetId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly name: string;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly status?: AssetStatus | undefined;
  readonly purchase?: PurchaseInfo | undefined;
  readonly warranty?: Warranty | undefined;
  readonly expectedLifeYears?: number | undefined;
  readonly condition?: AssetCondition | undefined;
  readonly notes?: string | undefined;
}

export function createAsset(input: NewAsset): Result<Asset, DomainError> {
  const purchase = input.purchase ?? {};
  const issues = new Issues();

  issues.check(isNonBlank(input.name), 'name', 'is required');
  issues.check(
    !input.warranty || !purchase.date || input.warranty.expiresOn >= purchase.date,
    'warranty.expiresOn',
    'cannot be before the purchase date',
  );
  issues.check(
    input.expectedLifeYears === undefined ||
      (Number.isInteger(input.expectedLifeYears) &&
        input.expectedLifeYears >= 1 &&
        input.expectedLifeYears <= 100),
    'expectedLifeYears',
    'must be a whole number of years between 1 and 100',
  );
  issues.check(
    !purchase.price || purchase.price.minor >= 0,
    'purchase.price',
    'cannot be negative',
  );

  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    name: input.name.trim(),
    categoryId: input.categoryId,
    locationId: input.locationId,
    status: input.status ?? 'active',
    purchase,
    warranty: input.warranty,
    expectedLifeYears: input.expectedLifeYears,
    condition: input.condition,
    notes: input.notes?.trim() || undefined,
  }));
}

/** When the asset is expected to need replacing: the purchase date plus its expected life. */
export function replacementDueOn(asset: Asset): LocalDate | undefined {
  const bought = asset.purchase.date;
  return bought && asset.expectedLifeYears !== undefined
    ? addYears(bought, asset.expectedLifeYears)
    : undefined;
}
