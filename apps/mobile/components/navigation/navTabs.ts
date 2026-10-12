/**
 * Which pages sit in the bottom bar, and in what order. Stored as a JSON array
 * of tab names in `settings.nav_tabs_json`; null (or anything that does not
 * parse into a valid bar) means the default five.
 *
 * Settings is where the bar is edited, so it is pinned: it can move but never
 * leave. Everything else is the user's choice, from two to five pages. The
 * first page is the home page: the app opens on it, and when Calendar is not
 * in the bar the + button moves to it.
 */
export type TabName =
  | 'calendar'
  | 'accounts'
  | 'insights'
  | 'albums'
  | 'settings'
  | 'goals'
  | 'recurring'
  | 'reimbursements'
  | 'receipts'
  | 'settleUp';

/** Every page that can sit in the bar, in the order "More pages" lists them. */
export const ALL_NAV_TABS: readonly TabName[] = [
  'calendar',
  'accounts',
  'insights',
  'albums',
  'settings',
  'goals',
  'recurring',
  'reimbursements',
  'receipts',
  'settleUp',
];

export const DEFAULT_NAV_TABS: readonly TabName[] = [
  'calendar',
  'accounts',
  'insights',
  'albums',
  'settings',
];

export const PINNED_NAV_TABS: readonly TabName[] = ['settings'];

/** The bar holds two to five pages: Settings and at least one other. */
export const MIN_NAV_TABS = 2;
export const MAX_NAV_TABS = 5;

export function isNavTab(value: unknown): value is TabName {
  return typeof value === 'string' && (ALL_NAV_TABS as readonly string[]).includes(value);
}

export function isPinnedNavTab(tab: TabName): boolean {
  return PINNED_NAV_TABS.includes(tab);
}

function isValidBar(tabs: readonly TabName[]): boolean {
  return (
    tabs.length >= MIN_NAV_TABS &&
    tabs.length <= MAX_NAV_TABS &&
    new Set(tabs).size === tabs.length &&
    PINNED_NAV_TABS.every((tab) => tabs.includes(tab))
  );
}

/** The stored bar, or the default one when nothing valid is stored. */
export function parseNavTabs(rawValue: string | null | undefined): TabName[] {
  if (!rawValue) return [...DEFAULT_NAV_TABS];
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [...DEFAULT_NAV_TABS];
    // A page a later version added and this one does not know is dropped
    // rather than throwing the whole bar away.
    const tabs = parsed.filter(isNavTab);
    return isValidBar(tabs) ? tabs : [...DEFAULT_NAV_TABS];
  } catch {
    return [...DEFAULT_NAV_TABS];
  }
}

/** What to store: null for the default bar, so it follows future defaults. */
export function serializeNavTabs(tabs: readonly TabName[]): string | null {
  if (!isValidBar(tabs)) return null;
  const isDefault =
    tabs.length === DEFAULT_NAV_TABS.length &&
    tabs.every((tab, index) => tab === DEFAULT_NAV_TABS[index]);
  return isDefault ? null : JSON.stringify(tabs);
}

/** Adds a page at the end of the bar, before Settings when Settings is last. */
export function addNavTab(tabs: readonly TabName[], tab: TabName): TabName[] {
  if (tabs.includes(tab) || tabs.length >= MAX_NAV_TABS) return [...tabs];
  const next = [...tabs];
  const insertAt = next[next.length - 1] === 'settings' ? next.length - 1 : next.length;
  next.splice(insertAt, 0, tab);
  return next;
}

/** The page the app opens on. */
export function homeNavTab(tabs: readonly TabName[]): TabName {
  return tabs[0] ?? DEFAULT_NAV_TABS[0];
}

/** Whether a page can leave the bar: never Settings, and never below two. */
export function canRemoveNavTab(tabs: readonly TabName[], tab: TabName): boolean {
  return !isPinnedNavTab(tab) && tabs.includes(tab) && tabs.length > MIN_NAV_TABS;
}

/** Removes a page from the bar. Pinned pages stay, and the bar keeps two. */
export function removeNavTab(tabs: readonly TabName[], tab: TabName): TabName[] {
  if (!canRemoveNavTab(tabs, tab)) return [...tabs];
  return tabs.filter((candidate) => candidate !== tab);
}

/** The pages not in the bar, in their "More pages" order. */
export function availableNavTabs(tabs: readonly TabName[]): TabName[] {
  return ALL_NAV_TABS.filter((tab) => !tabs.includes(tab));
}
