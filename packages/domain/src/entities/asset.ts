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
import { newMeta, type EntityMeta } from './meta';

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
    notes: input.notes?.trim() || undefined,
  }));
}
