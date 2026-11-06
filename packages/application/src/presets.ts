import {
  ok,
  type ActivityType,
  type Category,
  type RecurrenceUnit,
  type Result,
} from '@tend/domain';
import { createCategory } from './organise';
import { transact, type Deps } from './deps';

/** The category digital-upkeep activities are filed under. */
export const DIGITAL_CATEGORY = 'Digital';
/** The category household presets are filed under. */
export const HOUSEHOLD_CATEGORY = 'Household';

/**
 * A starting point for a new activity. Presets only prefill the form: what is saved is an
 * ordinary activity, so it can be edited like any other. They hold no money, provider or
 * credential fields on purpose (see G-12).
 */
export interface ActivityPreset {
  readonly key: string;
  /** Which page lists it, and where the form returns to after saving. */
  readonly group: 'digital' | 'routines' | 'household';
  /** Category the new activity is filed under unless the user picks another. */
  readonly category?: string | undefined;
  /** Short button label. */
  readonly label: string;
  readonly name: string;
  readonly type: ActivityType;
  readonly description: string;
  readonly checklist: readonly string[];
  readonly repeat: 'calendar' | 'after_completion';
  readonly every: number;
  readonly unit: RecurrenceUnit;
  readonly remind: boolean;
  readonly leadDays: number;
  /** Seasonal presets start on the next occurrence of this month and day. */
  readonly season?: { readonly month: number; readonly day: number } | undefined;
  /** Days after the due date before it counts as overdue; a seasonal window. */
  readonly graceDays?: number | undefined;
}

export const DIGITAL_PRESETS: readonly ActivityPreset[] = [
  {
    key: 'subscription',
    group: 'digital',
    category: DIGITAL_CATEGORY,
    label: 'Subscription renewal',
    name: 'Review subscription: ',
    type: 'renewal',
    description: 'Renewal date and provider: ',
    checklist: ['Still using it?', 'Check the price and plan', 'Cancel or renew'],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 14,
  },
  {
    key: 'domain',
    group: 'digital',
    category: DIGITAL_CATEGORY,
    label: 'Domain or hosting renewal',
    name: 'Renew domain: ',
    type: 'renewal',
    description: 'Registrar or host: ',
    checklist: [
      'Confirm auto-renew is on',
      'Check the payment method is valid',
      'Check contact email',
    ],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 30,
  },
  {
    key: 'backup',
    group: 'digital',
    category: DIGITAL_CATEGORY,
    label: 'Backup check',
    name: 'Check backups',
    type: 'inspection',
    description: 'What is backed up and where it goes: ',
    checklist: ['Latest backup completed', 'Restore one file as a test', 'Enough storage left'],
    repeat: 'calendar',
    every: 1,
    unit: 'month',
    remind: true,
    leadDays: 0,
  },
  {
    key: 'security',
    group: 'digital',
    category: DIGITAL_CATEGORY,
    label: 'Security review',
    name: 'Security review',
    type: 'inspection',
    description: 'Do not record passwords or recovery codes here.',
    checklist: [
      'Update devices and apps',
      'Review two-factor settings',
      'Review connected apps and devices',
      'Check recovery email and phone',
    ],
    repeat: 'calendar',
    every: 6,
    unit: 'month',
    remind: true,
    leadDays: 3,
  },
  {
    key: 'account',
    group: 'digital',
    category: DIGITAL_CATEGORY,
    label: 'Account review',
    name: 'Review account: ',
    type: 'administrative',
    description: 'Service: ',
    checklist: ['Close accounts you no longer use', 'Review privacy settings'],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: false,
    leadDays: 0,
  },
];

/** Personal routines and life admin. Listed by activity type, so no category is imposed. */
export const ROUTINE_PRESETS: readonly ActivityPreset[] = [
  {
    key: 'weekly-review',
    group: 'routines',
    label: 'Weekly review',
    name: 'Weekly review',
    type: 'routine',
    description: '',
    checklist: ['Look at the week ahead', 'Clear loose ends', 'Pick the top three priorities'],
    repeat: 'calendar',
    every: 1,
    unit: 'week',
    remind: true,
    leadDays: 0,
  },
  {
    key: 'declutter',
    group: 'routines',
    label: 'Declutter',
    name: 'Declutter one area',
    type: 'routine',
    description: 'Area for this round: ',
    checklist: ['Sort: keep, donate, bin', 'Put things back where they belong'],
    repeat: 'after_completion',
    every: 1,
    unit: 'month',
    remind: false,
    leadDays: 0,
  },
  {
    key: 'health-checkup',
    group: 'routines',
    label: 'Health check-up',
    name: 'Book health check-up',
    type: 'administrative',
    description: '',
    checklist: ['Book the appointment', 'Note anything to ask'],
    repeat: 'after_completion',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 14,
  },
  {
    key: 'documents',
    group: 'routines',
    label: 'ID and documents expiry',
    name: 'Check ID and document expiry: ',
    type: 'administrative',
    description: 'Passport, licence, permits and similar. Expiry date: ',
    checklist: ['Check the expiry date', 'Start renewal if it is within six months'],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 30,
  },
  {
    key: 'insurance',
    group: 'routines',
    label: 'Insurance and policies review',
    name: 'Review insurance and policies',
    type: 'administrative',
    description: '',
    checklist: ['Is the cover still right?', 'Check the renewal date'],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 30,
  },
];

/** Room cleaning checklists and seasonal chores. Listed by the Household view. */
export const HOUSEHOLD_PRESETS: readonly ActivityPreset[] = [
  {
    key: 'kitchen',
    group: 'household',
    category: HOUSEHOLD_CATEGORY,
    label: 'Kitchen deep clean',
    name: 'Deep clean the kitchen',
    type: 'cleaning',
    description: '',
    checklist: [
      'Clean the oven and hob',
      'Wipe cupboard fronts',
      'Clean the fridge and bin out old food',
      'Descale the kettle',
      'Mop the floor',
    ],
    repeat: 'calendar',
    every: 1,
    unit: 'month',
    remind: true,
    leadDays: 0,
  },
  {
    key: 'bathroom',
    group: 'household',
    category: HOUSEHOLD_CATEGORY,
    label: 'Bathroom clean',
    name: 'Clean the bathroom',
    type: 'cleaning',
    description: '',
    checklist: ['Toilet', 'Sink and taps', 'Shower and tiles', 'Mirror', 'Floor'],
    repeat: 'calendar',
    every: 1,
    unit: 'week',
    remind: true,
    leadDays: 0,
  },
  {
    key: 'bedroom',
    group: 'household',
    category: HOUSEHOLD_CATEGORY,
    label: 'Bedroom linens',
    name: 'Change bed linens',
    type: 'cleaning',
    description: '',
    checklist: ['Strip and wash bedding', 'Remake the bed', 'Vacuum under the bed'],
    repeat: 'calendar',
    every: 2,
    unit: 'week',
    remind: false,
    leadDays: 0,
  },
  {
    key: 'spring-clean',
    group: 'household',
    category: HOUSEHOLD_CATEGORY,
    label: 'Spring clean',
    name: 'Spring clean',
    type: 'cleaning',
    description: 'Starts 20 March. Move the date if spring comes at a different time for you.',
    checklist: [
      'Wash windows',
      'Clean behind and under furniture',
      'Sort and donate',
      'Air out rugs and curtains',
    ],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 7,
    season: { month: 3, day: 20 },
    graceDays: 14,
  },
  {
    key: 'gutters',
    group: 'household',
    category: HOUSEHOLD_CATEGORY,
    label: 'Autumn gutter and roof check',
    name: 'Clear gutters and check the roof',
    type: 'inspection',
    description: 'Starts 1 October.',
    checklist: [
      'Clear gutters and downpipes',
      'Look for loose or missing tiles',
      'Check for leaks in the loft',
    ],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 7,
    season: { month: 10, day: 1 },
    graceDays: 21,
  },
  {
    key: 'cooling',
    group: 'household',
    category: HOUSEHOLD_CATEGORY,
    label: 'Cooling service before summer',
    name: 'Service air conditioning and fans',
    type: 'maintenance',
    description: 'Starts 1 March.',
    checklist: [
      'Clean or replace filters',
      'Check the outdoor unit is clear',
      'Test cooling before the heat arrives',
    ],
    repeat: 'calendar',
    every: 1,
    unit: 'year',
    remind: true,
    leadDays: 14,
    season: { month: 3, day: 1 },
    graceDays: 30,
  },
];

export const ALL_PRESETS: readonly ActivityPreset[] = [
  ...DIGITAL_PRESETS,
  ...ROUTINE_PRESETS,
  ...HOUSEHOLD_PRESETS,
];

export function findPreset(key: string | null | undefined): ActivityPreset | undefined {
  return ALL_PRESETS.find((p) => p.key === key);
}

/** Returns the category with this name, creating it the first time. Matching ignores case. */
export async function ensureCategory(deps: Deps, name: string): Promise<Result<Category>> {
  const wanted = name.trim().toLowerCase();
  const existing = await transact(deps, async (repos) => {
    const all = await repos.categories.list();
    const hit = all.find((c) => c.name.trim().toLowerCase() === wanted);
    return ok(hit ?? null);
  });
  if (!existing.ok) return existing;
  if (existing.value) return ok(existing.value);
  return createCategory(deps, { name });
}
