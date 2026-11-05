import { listCategories, listLocations } from '@upkeep/application';
import { useLiveQuery } from './hooks';

const select = 'mt-1 block w-full max-w-md rounded border border-slate-300 px-2 py-1';

interface PickerProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (id: string) => void;
  /** First option, for "no choice" (e.g. "None" when editing, "All" when filtering). */
  readonly empty?: string;
  readonly className?: string;
}

/** A category dropdown. */
export function CategorySelect({ label, value, onChange, empty = 'None', className }: PickerProps) {
  const categories = useLiveQuery(({ repos }) => listCategories(repos));
  return (
    <label className="block text-sm">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? select}
      >
        <option value="">{empty}</option>
        {categories.status === 'ready'
          ? categories.data.map(({ category }) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))
          : null}
      </select>
    </label>
  );
}

/** A place dropdown, showing each place with where it sits ("House › Kitchen"). */
export function LocationSelect({ label, value, onChange, empty = 'None', className }: PickerProps) {
  const locations = useLiveQuery(({ repos }) => listLocations(repos));
  return (
    <label className="block text-sm">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className ?? select}
      >
        <option value="">{empty}</option>
        {locations.status === 'ready'
          ? locations.data.map(({ location, path }) => (
              <option key={location.id} value={location.id}>
                {path}
              </option>
            ))
          : null}
      </select>
    </label>
  );
}
