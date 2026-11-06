import { useState, type FormEvent } from 'react';
import {
  createCategory,
  createLocation,
  deleteCategory,
  deleteLocation,
  listCategories,
  listLocations,
  updateCategory,
  updateLocation,
  type CategoryListItem,
  type LocationListItem,
} from '@tend/application';
import type { CategoryId, Location, LocationId, LocationKind, Result } from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { describeError, useAction, useLiveQuery } from '../../shared/hooks';
import { LocationSelect } from '../../shared/ui/pickers';

const input = 'field mt-1 block';
const button = 'btn';
const primary = 'btn btn-primary';

const usage = (activities: number, assets: number): string => {
  const parts = [
    activities > 0 ? `${activities} ${activities === 1 ? 'activity' : 'activities'}` : '',
    assets > 0 ? `${assets} ${assets === 1 ? 'asset' : 'assets'}` : '',
  ].filter(Boolean);
  return parts.length === 0 ? 'not used yet' : parts.join(', ');
};

/** Runs an action and keeps its error message to show beside the list. */
function useRunner() {
  const act = useAction();
  const [error, setError] = useState<string | null>(null);
  async function run<T>(work: () => Promise<Result<T>>): Promise<boolean> {
    setError(null);
    const result = await act(work);
    if (!result.ok) {
      setError(describeError(result.error));
      return false;
    }
    return true;
  }
  return { run, error };
}

type Run = ReturnType<typeof useRunner>['run'];

// --------------------------------------------------------------------- categories

export function CategoriesSection() {
  const { deps } = useApp();
  const { run, error } = useRunner();
  const categories = useLiveQuery(({ repos }) => listCategories(repos));
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<CategoryId | null>(null);
  const [draft, setDraft] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await run(() => createCategory(deps, { name }))) setName('');
  }

  async function rename(item: CategoryListItem) {
    if (await run(() => updateCategory(deps, { categoryId: item.category.id, name: draft }))) {
      setEditing(null);
    }
  }

  return (
    <section aria-labelledby="categories-heading" className="space-y-3">
      <div>
        <h3 id="categories-heading" className="text-lg font-medium">
          Categories
        </h3>
        <p className="text-sm text-muted">
          Group activities and assets, for example Cleaning, Vehicles or Garden.
        </p>
      </div>

      {categories.status === 'ready' && categories.data.length === 0 ? (
        <p className="text-sm text-muted">No categories yet.</p>
      ) : null}

      <ul className="space-y-2">
        {categories.status === 'ready'
          ? categories.data.map((item) => (
              <li
                key={item.category.id}
                className="flex flex-wrap items-center justify-between gap-2 card p-2"
              >
                {editing === item.category.id ? (
                  <form
                    className="flex flex-wrap items-center gap-2"
                    aria-label={`Rename ${item.category.name}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename(item);
                    }}
                  >
                    <input
                      aria-label="Category name"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className={input}
                    />
                    <button type="submit" className={primary}>
                      Save
                    </button>
                    <button type="button" className={button} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span>
                      <span className="font-medium">{item.category.name}</span>
                      <span className="ml-2 text-sm text-muted">
                        {usage(item.activityCount, item.assetCount)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className={button}
                        aria-label={`Rename ${item.category.name}`}
                        onClick={() => {
                          setEditing(item.category.id);
                          setDraft(item.category.name);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className={button}
                        aria-label={`Delete ${item.category.name}`}
                        onClick={() =>
                          void run(() => deleteCategory(deps, { categoryId: item.category.id }))
                        }
                      >
                        Delete
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))
          : null}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <form onSubmit={add} aria-label="Add category" className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          New category
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <button type="submit" className={primary}>
          Add category
        </button>
      </form>
    </section>
  );
}

// --------------------------------------------------------------------- locations

const KINDS: [LocationKind, string][] = [
  ['room', 'Room'],
  ['area', 'Area'],
  ['place', 'Place'],
];

export function LocationsSection() {
  const { deps } = useApp();
  const { run, error } = useRunner();
  const locations = useLiveQuery(({ repos }) => listLocations(repos));
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LocationKind>('room');
  const [parent, setParent] = useState('');
  const [editing, setEditing] = useState<LocationListItem | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      createLocation(deps, {
        name,
        kind,
        parentId: parent ? (parent as LocationId) : undefined,
      }),
    );
    if (ok) setName('');
  }

  return (
    <section aria-labelledby="locations-heading" className="space-y-3">
      <div>
        <h3 id="locations-heading" className="text-lg font-medium">
          Places
        </h3>
        <p className="text-sm text-muted">
          Where things are, for example House, then Kitchen inside it, then Pantry inside that.
        </p>
      </div>

      {locations.status === 'ready' && locations.data.length === 0 ? (
        <p className="text-sm text-muted">No places yet.</p>
      ) : null}

      <ul className="space-y-2">
        {locations.status === 'ready'
          ? locations.data.map((item) => (
              <li
                key={item.location.id}
                style={{ marginLeft: `${item.depth * 1.25}rem` }}
                className="card p-2"
              >
                {editing?.location.id === item.location.id ? (
                  <LocationEditor item={item} onDone={() => setEditing(null)} run={run} />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{item.location.name}</span>
                      <span className="ml-2 text-sm text-muted">
                        {item.location.kind} · {usage(item.activityCount, item.assetCount)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className={button}
                        aria-label={`Edit ${item.location.name}`}
                        onClick={() => setEditing(item)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className={button}
                        aria-label={`Delete ${item.location.name}`}
                        onClick={() =>
                          void run(() => deleteLocation(deps, { locationId: item.location.id }))
                        }
                      >
                        Delete
                      </button>
                    </span>
                  </div>
                )}
              </li>
            ))
          : null}
      </ul>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <form onSubmit={add} aria-label="Add place" className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          New place
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block text-sm">
          Type
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LocationKind)}
            className={input}
          >
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <LocationSelect
          label="Inside"
          empty="Nowhere (top level)"
          value={parent}
          onChange={setParent}
          className={input}
        />
        <button type="submit" className={primary}>
          Add place
        </button>
      </form>
    </section>
  );
}

function LocationEditor({
  item,
  onDone,
  run,
}: {
  item: LocationListItem;
  onDone: () => void;
  run: Run;
}) {
  const { deps } = useApp();
  const location: Location = item.location;
  const [name, setName] = useState(location.name);
  const [kind, setKind] = useState<LocationKind>(location.kind);
  const [parent, setParent] = useState<string>(location.parentId ?? '');

  return (
    <form
      aria-label={`Edit ${location.name}`}
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() =>
          updateLocation(deps, {
            locationId: location.id,
            name,
            kind,
            parentId: parent ? (parent as LocationId) : undefined,
          }),
        );
        if (ok) onDone();
      }}
    >
      <label className="block text-sm">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
      </label>
      <label className="block text-sm">
        Type
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LocationKind)}
          className={input}
        >
          {KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <LocationSelect
        label="Inside"
        empty="Nowhere (top level)"
        value={parent}
        onChange={setParent}
        className={input}
      />
      <button type="submit" className={primary}>
        Save
      </button>
      <button type="button" className={button} onClick={onDone}>
        Cancel
      </button>
    </form>
  );
}
