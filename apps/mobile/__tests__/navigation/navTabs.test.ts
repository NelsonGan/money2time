import {
  addNavTab,
  availableNavTabs,
  canRemoveNavTab,
  DEFAULT_NAV_TABS,
  homeNavTab,
  MAX_NAV_TABS,
  parseNavTabs,
  removeNavTab,
  serializeNavTabs,
} from '~/components/navigation/navTabs';

describe('parseNavTabs', () => {
  it('falls back to the default bar when nothing is stored', () => {
    expect(parseNavTabs(null)).toEqual(DEFAULT_NAV_TABS);
    expect(parseNavTabs('')).toEqual(DEFAULT_NAV_TABS);
  });

  it('reads a stored bar in its stored order', () => {
    const stored = JSON.stringify(['calendar', 'recurring', 'settleUp', 'settings']);
    expect(parseNavTabs(stored)).toEqual(['calendar', 'recurring', 'settleUp', 'settings']);
  });

  it('reads a bar without Calendar, whose first page is then home', () => {
    const tabs = parseNavTabs(JSON.stringify(['accounts', 'insights', 'settings']));
    expect(tabs).toEqual(['accounts', 'insights', 'settings']);
    expect(homeNavTab(tabs)).toBe('accounts');
  });

  it('rejects a bar without Settings or with Settings alone', () => {
    expect(parseNavTabs(JSON.stringify(['calendar', 'accounts']))).toEqual(DEFAULT_NAV_TABS);
    expect(parseNavTabs(JSON.stringify(['settings']))).toEqual(DEFAULT_NAV_TABS);
  });

  it('rejects duplicates, too many pages and junk', () => {
    expect(parseNavTabs(JSON.stringify(['calendar', 'calendar', 'settings']))).toEqual(
      DEFAULT_NAV_TABS,
    );
    expect(
      parseNavTabs(
        JSON.stringify(['calendar', 'accounts', 'insights', 'albums', 'goals', 'settings']),
      ),
    ).toEqual(DEFAULT_NAV_TABS);
    expect(parseNavTabs('{"tabs":[]}')).toEqual(DEFAULT_NAV_TABS);
    expect(parseNavTabs('not json')).toEqual(DEFAULT_NAV_TABS);
  });

  it('drops a page it does not know and keeps the rest', () => {
    const stored = JSON.stringify(['calendar', 'future-page', 'goals', 'settings']);
    expect(parseNavTabs(stored)).toEqual(['calendar', 'goals', 'settings']);
  });
});

describe('serializeNavTabs', () => {
  it('stores null for the default bar so it follows future defaults', () => {
    expect(serializeNavTabs(DEFAULT_NAV_TABS)).toBeNull();
  });

  it('stores a custom bar and reads it back unchanged', () => {
    const tabs = ['settings', 'goals', 'calendar'] as const;
    const stored = serializeNavTabs(tabs);
    expect(stored).not.toBeNull();
    expect(parseNavTabs(stored)).toEqual(tabs);
  });

  it('refuses an invalid bar', () => {
    expect(serializeNavTabs(['calendar'])).toBeNull();
  });
});

describe('editing the bar', () => {
  it('adds a page before Settings when Settings is last', () => {
    const tabs = removeNavTab(DEFAULT_NAV_TABS, 'albums');
    expect(addNavTab(tabs, 'recurring')).toEqual([
      'calendar',
      'accounts',
      'insights',
      'recurring',
      'settings',
    ]);
  });

  it('adds at the end when Settings has been moved', () => {
    expect(addNavTab(['settings', 'calendar'], 'goals')).toEqual(['settings', 'calendar', 'goals']);
  });

  it('never grows past the maximum or adds a page twice', () => {
    expect(DEFAULT_NAV_TABS).toHaveLength(MAX_NAV_TABS);
    expect(addNavTab(DEFAULT_NAV_TABS, 'goals')).toEqual(DEFAULT_NAV_TABS);
    expect(addNavTab(['calendar', 'settings'], 'calendar')).toEqual(['calendar', 'settings']);
  });

  it('keeps Settings and never shrinks the bar below two pages', () => {
    expect(removeNavTab(DEFAULT_NAV_TABS, 'settings')).toEqual(DEFAULT_NAV_TABS);
    expect(canRemoveNavTab(DEFAULT_NAV_TABS, 'settings')).toBe(false);
    expect(removeNavTab(['goals', 'settings'], 'goals')).toEqual(['goals', 'settings']);
    expect(canRemoveNavTab(['goals', 'settings'], 'goals')).toBe(false);
    expect(removeNavTab(DEFAULT_NAV_TABS, 'calendar')).toEqual([
      'accounts',
      'insights',
      'albums',
      'settings',
    ]);
    expect(removeNavTab(DEFAULT_NAV_TABS, 'insights')).toEqual([
      'calendar',
      'accounts',
      'albums',
      'settings',
    ]);
  });

  it('makes the first page home', () => {
    expect(homeNavTab(DEFAULT_NAV_TABS)).toBe('calendar');
    expect(homeNavTab(['settings', 'goals'])).toBe('settings');
  });

  it('lists the pages not in the bar', () => {
    expect(availableNavTabs(DEFAULT_NAV_TABS)).toEqual([
      'goals',
      'recurring',
      'reimbursements',
      'receipts',
      'settleUp',
    ]);
  });
});
