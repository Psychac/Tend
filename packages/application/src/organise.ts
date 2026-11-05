import type { Repositories } from '@tend/contracts';
import {
  createCategory as createCategoryEntity,
  createLocation as createLocationEntity,
  err,
  invariantError,
  notFoundError,
  ok,
  touch,
  validationError,
  type Category,
  type CategoryId,
  type Location,
  type LocationId,
  type LocationKind,
  type Result,
} from '@tend/domain';
import { auditEvent, found, transact, type Deps } from './deps';

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Says what is using something, for example "2 activities and 1 asset". */
function usageText(activities: number, assets: number, places = 0): string {
  const parts = [
    activities > 0 ? plural(activities, 'activity', 'activities') : '',
    assets > 0 ? plural(assets, 'asset', 'assets') : '',
    places > 0 ? plural(places, 'place inside it', 'places inside it') : '',
  ].filter(Boolean);
  return parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
    : (parts[0] ?? '');
}

// ------------------------------------------------------------------ categories

export interface CategoryInput {
  readonly name: string;
  readonly description?: string | undefined;
}

export async function createCategory(deps: Deps, input: CategoryInput): Promise<Result<Category>> {
  return transact(deps, async (repos) => {
    const duplicate = (await repos.categories.list()).some((c) => sameName(c.name, input.name));
    if (duplicate) {
      return err(
        validationError([{ path: 'name', message: 'a category with this name already exists' }]),
      );
    }
    const created = createCategoryEntity({
      id: deps.ids.next<'Category'>(),
      ownerId: deps.ownerId,
      now: deps.clock.now(),
      ...input,
    });
    if (!created.ok) return created;
    await repos.categories.save(created.value);
    await repos.audit.add(
      auditEvent(deps, 'category', created.value.id, 'created', created.value.name),
    );
    return ok(created.value);
  });
}

export async function updateCategory(
  deps: Deps,
  input: CategoryInput & { categoryId: CategoryId },
): Promise<Result<Category>> {
  return transact(deps, async (repos) => {
    const loaded = found(
      'Category',
      input.categoryId,
      await repos.categories.getById(input.categoryId),
    );
    if (!loaded.ok) return loaded;
    const others = (await repos.categories.list()).filter((c) => c.id !== input.categoryId);
    if (others.some((c) => sameName(c.name, input.name))) {
      return err(
        validationError([{ path: 'name', message: 'a category with this name already exists' }]),
      );
    }
    const now = deps.clock.now();
    const checked = createCategoryEntity({
      id: loaded.value.id,
      ownerId: loaded.value.meta.ownerId,
      now,
      name: input.name,
      description: input.description,
    });
    if (!checked.ok) return checked;
    const updated: Category = { ...checked.value, meta: touch(loaded.value.meta, now) };
    await repos.categories.save(updated);
    await repos.audit.add(auditEvent(deps, 'category', updated.id, 'updated', updated.name));
    return ok(updated);
  });
}

/** Deletes a category nothing uses. A category in use is refused, so nothing is silently re-labelled. */
export async function deleteCategory(
  deps: Deps,
  input: { categoryId: CategoryId },
): Promise<Result<void>> {
  return transact(deps, async (repos) => {
    const loaded = found(
      'Category',
      input.categoryId,
      await repos.categories.getById(input.categoryId),
    );
    if (!loaded.ok) return loaded;
    const [activities, assets] = await Promise.all([
      repos.activities.list({ categoryId: input.categoryId, includeArchived: true }),
      repos.assets.list({ categoryId: input.categoryId }),
    ]);
    if (activities.length + assets.length > 0) {
      return err(
        invariantError(
          `${loaded.value.name} is used by ${usageText(activities.length, assets.length)}. Move them to another category first.`,
        ),
      );
    }
    await repos.categories.delete(input.categoryId);
    await repos.audit.add(
      auditEvent(deps, 'category', input.categoryId, 'deleted', loaded.value.name),
    );
    return ok(undefined);
  });
}

// ------------------------------------------------------------------ locations

export interface LocationInput {
  readonly name: string;
  readonly kind?: LocationKind | undefined;
  readonly parentId?: LocationId | undefined;
}

/** True if `candidate` is `id` itself or one of its descendants, so moving `id` under it would loop. */
function wouldLoop(
  all: readonly Location[],
  id: LocationId,
  candidate: LocationId | undefined,
): boolean {
  const byId = new Map(all.map((l) => [l.id, l]));
  const seen = new Set<LocationId>();
  for (let at = candidate; at !== undefined; at = byId.get(at)?.parentId) {
    if (at === id) return true;
    if (seen.has(at)) return false; // an existing loop elsewhere; not caused by this change
    seen.add(at);
  }
  return false;
}

export async function createLocation(deps: Deps, input: LocationInput): Promise<Result<Location>> {
  return transact(deps, async (repos) => {
    const all = await repos.locations.list();
    if (input.parentId && !all.some((l) => l.id === input.parentId)) {
      return err(notFoundError('Location', input.parentId));
    }
    if (all.some((l) => l.parentId === input.parentId && sameName(l.name, input.name))) {
      return err(
        validationError([
          { path: 'name', message: 'there is already a place with this name here' },
        ]),
      );
    }
    const created = createLocationEntity({
      id: deps.ids.next<'Location'>(),
      ownerId: deps.ownerId,
      now: deps.clock.now(),
      ...input,
    });
    if (!created.ok) return created;
    await repos.locations.save(created.value);
    await repos.audit.add(
      auditEvent(deps, 'location', created.value.id, 'created', created.value.name),
    );
    return ok(created.value);
  });
}

export async function updateLocation(
  deps: Deps,
  input: LocationInput & { locationId: LocationId },
): Promise<Result<Location>> {
  return transact(deps, async (repos) => {
    const all = await repos.locations.list();
    const loaded = found(
      'Location',
      input.locationId,
      all.find((l) => l.id === input.locationId) ?? null,
    );
    if (!loaded.ok) return loaded;
    if (input.parentId && !all.some((l) => l.id === input.parentId)) {
      return err(notFoundError('Location', input.parentId));
    }
    if (wouldLoop(all, input.locationId, input.parentId)) {
      return err(
        validationError([{ path: 'parentId', message: 'a place cannot be moved inside itself' }]),
      );
    }
    const clash = all.some(
      (l) =>
        l.id !== input.locationId && l.parentId === input.parentId && sameName(l.name, input.name),
    );
    if (clash) {
      return err(
        validationError([
          { path: 'name', message: 'there is already a place with this name here' },
        ]),
      );
    }
    const now = deps.clock.now();
    const checked = createLocationEntity({
      id: loaded.value.id,
      ownerId: loaded.value.meta.ownerId,
      now,
      name: input.name,
      kind: input.kind,
      parentId: input.parentId,
    });
    if (!checked.ok) return checked;
    const updated: Location = { ...checked.value, meta: touch(loaded.value.meta, now) };
    await repos.locations.save(updated);
    await repos.audit.add(auditEvent(deps, 'location', updated.id, 'updated', updated.name));
    return ok(updated);
  });
}

/** Deletes a place nothing uses and nothing is inside. */
export async function deleteLocation(
  deps: Deps,
  input: { locationId: LocationId },
): Promise<Result<void>> {
  return transact(deps, async (repos) => {
    const all = await repos.locations.list();
    const loaded = found(
      'Location',
      input.locationId,
      all.find((l) => l.id === input.locationId) ?? null,
    );
    if (!loaded.ok) return loaded;
    const [activities, assets] = await Promise.all([
      repos.activities.list({ locationId: input.locationId, includeArchived: true }),
      repos.assets.list({ locationId: input.locationId }),
    ]);
    const children = all.filter((l) => l.parentId === input.locationId).length;
    if (activities.length + assets.length + children > 0) {
      return err(
        invariantError(
          `${loaded.value.name} is in use: ${usageText(activities.length, assets.length, children)}. Move them first.`,
        ),
      );
    }
    await repos.locations.delete(input.locationId);
    await repos.audit.add(
      auditEvent(deps, 'location', input.locationId, 'deleted', loaded.value.name),
    );
    return ok(undefined);
  });
}

// ------------------------------------------------------------------ queries

/** "Kitchen › Pantry" for every place, by id. Tolerates missing parents and loops. */
export function locationPaths(locations: readonly Location[]): Map<LocationId, string> {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const out = new Map<LocationId, string>();
  for (const location of locations) {
    const names: string[] = [];
    const seen = new Set<LocationId>();
    for (
      let at: Location | undefined = location;
      at && !seen.has(at.id);
      at = at.parentId ? byId.get(at.parentId) : undefined
    ) {
      seen.add(at.id);
      names.unshift(at.name);
    }
    out.set(location.id, names.join(' › '));
  }
  return out;
}

export interface CategoryListItem {
  readonly category: Category;
  readonly activityCount: number;
  readonly assetCount: number;
}

export async function listCategories(repos: Repositories): Promise<CategoryListItem[]> {
  const [categories, activities, assets] = await Promise.all([
    repos.categories.list(),
    repos.activities.list({ includeArchived: true }),
    repos.assets.list({}),
  ]);
  return categories
    .map((category) => ({
      category,
      activityCount: activities.filter((a) => a.categoryId === category.id).length,
      assetCount: assets.filter((a) => a.categoryId === category.id).length,
    }))
    .sort((a, b) => a.category.name.localeCompare(b.category.name));
}

export interface LocationListItem {
  readonly location: Location;
  /** 0 for a top-level place. */
  readonly depth: number;
  /** "Kitchen › Pantry": where it sits, for pickers and lists. */
  readonly path: string;
  readonly activityCount: number;
  readonly assetCount: number;
}

/** Places in tree order (each parent followed by its children), with usage counts. */
export async function listLocations(repos: Repositories): Promise<LocationListItem[]> {
  const [locations, activities, assets] = await Promise.all([
    repos.locations.list(),
    repos.activities.list({ includeArchived: true }),
    repos.assets.list({}),
  ]);
  const children = new Map<LocationId | undefined, Location[]>();
  for (const l of locations) {
    const key = locations.some((p) => p.id === l.parentId) ? l.parentId : undefined; // orphans become top level
    children.set(key, [...(children.get(key) ?? []), l]);
  }
  const out: LocationListItem[] = [];
  const visit = (
    parent: LocationId | undefined,
    depth: number,
    trail: string[],
    seen: Set<string>,
  ) => {
    const siblings = (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const location of siblings) {
      if (seen.has(location.id)) continue;
      seen.add(location.id);
      const path = [...trail, location.name];
      out.push({
        location,
        depth,
        path: path.join(' › '),
        activityCount: activities.filter((a) => a.locationId === location.id).length,
        assetCount: assets.filter((a) => a.locationId === location.id).length,
      });
      visit(location.id, depth + 1, path, seen);
    }
  };
  visit(undefined, 0, [], new Set());
  return out;
}
