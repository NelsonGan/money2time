jest.mock('~/lib/db/client', () => ({ getDb: jest.fn() }));
jest.mock('~/lib/repositories/ledgersRepository', () => ({
  ledgersRepository: { update: jest.fn(), updatePrefs: jest.fn(), getPrefs: jest.fn() },
}));

import { getDb } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, setActiveLedgerId } from '~/lib/db/ledgerScope';
import { ledgersRepository } from '~/lib/repositories/ledgersRepository';
import { settingsRepository } from '~/lib/repositories/settingsRepository';

const mockedGetDb = getDb as jest.Mock;
const ledgers = ledgersRepository as jest.Mocked<typeof ledgersRepository>;

const SETTINGS_ROW = {
  id: 'primary',
  appUserId: 'user-1',
  locale: 'en',
  currencyCode: 'MYR',
  currencySymbol: 'RM',
  defaultPaybackAccountId: 'main-bank',
  quickEntryPrefsJson: JSON.stringify({
    defaultAccountId: 'main-cash',
    categoryMap: { food: 'main-food' },
    voiceUsageCount: 7,
    addPrimaryAction: 'full',
  }),
  insightsPrefsJson: '{"main":true}',
  activeLedgerId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
};

/**
 * A fake Drizzle builder: each `.get()` returns the next queued row, and each
 * `.set()` records what an update wrote.
 */
function fakeDb(rows: unknown[]) {
  const writes: Record<string, unknown>[] = [];
  const builder = {
    select: () => builder,
    from: () => builder,
    where: () => builder,
    update: () => builder,
    set: (values: Record<string, unknown>) => {
      writes.push(values);
      return builder;
    },
    run: () => undefined,
    get: () => rows.shift(),
  };
  mockedGetDb.mockReturnValue(builder);
  return writes;
}

describe('settings with a ledger open', () => {
  afterEach(() => {
    setActiveLedgerId(DEFAULT_LEDGER_ID);
    jest.clearAllMocks();
  });

  it('reads the default ledger exactly from the settings row', () => {
    fakeDb([SETTINGS_ROW]);
    const settings = settingsRepository.get();
    expect(settings).toMatchObject({
      currencyCode: 'MYR',
      defaultPaybackAccountId: 'main-bank',
      activeLedgerId: DEFAULT_LEDGER_ID,
    });
  });

  it("overlays another ledger's currency and payback account", () => {
    setActiveLedgerId('work');
    fakeDb([
      SETTINGS_ROW,
      { currencyCode: 'USD', currencySymbol: '$', prefsJson: '{"defaultPaybackAccountId":"w1"}' },
    ]);
    expect(settingsRepository.get()).toMatchObject({
      currencyCode: 'USD',
      currencySymbol: '$',
      defaultPaybackAccountId: 'w1',
    });
  });

  it("writes a ledger's own settings to its row and the rest to the settings row", () => {
    setActiveLedgerId('work');
    const writes = fakeDb([]);
    settingsRepository.updateSettings({
      currencyCode: 'EUR',
      currencySymbol: '€',
      defaultPaybackAccountId: 'w2',
      themeMode: 'dark',
    });
    expect(ledgers.update).toHaveBeenCalledWith('work', {
      currencyCode: 'EUR',
      currencySymbol: '€',
    });
    expect(ledgers.updatePrefs).toHaveBeenCalledWith('work', { defaultPaybackAccountId: 'w2' });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ themeMode: 'dark' });
    expect(writes[0]).not.toHaveProperty('currencyCode');
  });

  it('keeps the default ledger writing every setting to the settings row', () => {
    const writes = fakeDb([]);
    settingsRepository.updateSettings({ currencyCode: 'EUR', themeMode: 'dark' });
    expect(ledgers.update).not.toHaveBeenCalled();
    expect(writes[0]).toMatchObject({ currencyCode: 'EUR', themeMode: 'dark' });
  });

  it("merges quick entry: the ledger's own picks over the app's other preferences", () => {
    setActiveLedgerId('work');
    fakeDb([SETTINGS_ROW]);
    ledgers.getPrefs.mockReturnValue({ quickEntry: { defaultAccountId: 'work-cash' } });
    expect(JSON.parse(settingsRepository.getQuickEntryPrefsJson() as string)).toEqual({
      defaultAccountId: 'work-cash',
      voiceUsageCount: 7,
      addPrimaryAction: 'full',
    });
  });

  it("saves a ledger's quick-entry picks to it, leaving the default ledger's untouched", () => {
    setActiveLedgerId('work');
    const writes = fakeDb([SETTINGS_ROW]);
    settingsRepository.updateQuickEntryPrefsJson(
      JSON.stringify({
        defaultAccountId: 'work-bank',
        voiceUsageCount: 8,
        addPrimaryAction: 'scan',
      }),
    );
    expect(ledgers.updatePrefs).toHaveBeenCalledWith('work', {
      quickEntry: { defaultAccountId: 'work-bank' },
    });
    expect(JSON.parse(writes[0]?.quickEntryPrefsJson as string)).toEqual({
      voiceUsageCount: 8,
      addPrimaryAction: 'scan',
      defaultAccountId: 'main-cash',
      categoryMap: { food: 'main-food' },
    });
  });

  it('keeps Insights preferences per ledger', () => {
    setActiveLedgerId('work');
    ledgers.getPrefs.mockReturnValue({ insightsPrefsJson: '{"work":true}' });
    expect(settingsRepository.getInsightsPreferencesJson()).toBe('{"work":true}');
    settingsRepository.updateInsightsPreferencesJson('{"work":false}');
    expect(ledgers.updatePrefs).toHaveBeenCalledWith('work', {
      insightsPrefsJson: '{"work":false}',
    });
  });
});
