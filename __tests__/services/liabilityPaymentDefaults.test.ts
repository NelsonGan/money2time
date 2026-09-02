import {
  getLiabilityPaymentDefaults,
  liabilityPaymentDefaultsTestUtils,
  rememberLiabilityPaymentDefaults,
} from '~/services/liabilityPaymentDefaults';

const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  }),
}));

describe('liability payment defaults', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('remembers nothing for a liability that has never been paid', async () => {
    expect(await getLiabilityPaymentDefaults('user-1', 'card-1')).toBeNull();
  });

  it('remembers the account and note per liability', async () => {
    await rememberLiabilityPaymentDefaults('user-1', 'card-1', {
      fromAccountId: 'bank-1',
      note: 'Visa bill',
    });
    await rememberLiabilityPaymentDefaults('user-1', 'loan-1', {
      fromAccountId: 'bank-2',
      note: null,
    });
    expect(await getLiabilityPaymentDefaults('user-1', 'card-1')).toEqual({
      fromAccountId: 'bank-1',
      note: 'Visa bill',
    });
    expect(await getLiabilityPaymentDefaults('user-1', 'loan-1')).toEqual({
      fromAccountId: 'bank-2',
      note: null,
    });
  });

  it('overwrites with the latest payment', async () => {
    await rememberLiabilityPaymentDefaults('user-1', 'card-1', {
      fromAccountId: 'bank-1',
      note: 'first',
    });
    await rememberLiabilityPaymentDefaults('user-1', 'card-1', {
      fromAccountId: 'bank-2',
      note: '   ',
    });
    // A blank note is no note.
    expect(await getLiabilityPaymentDefaults('user-1', 'card-1')).toEqual({
      fromAccountId: 'bank-2',
      note: null,
    });
  });

  it('keeps users apart', async () => {
    await rememberLiabilityPaymentDefaults('user-1', 'card-1', {
      fromAccountId: 'bank-1',
      note: null,
    });
    expect(await getLiabilityPaymentDefaults('user-2', 'card-1')).toBeNull();
    expect(liabilityPaymentDefaultsTestUtils.storageKey('user-2')).not.toBe(
      liabilityPaymentDefaultsTestUtils.storageKey('user-1'),
    );
  });

  it('reads a malformed store as nothing remembered', () => {
    const { parseDefaults } = liabilityPaymentDefaultsTestUtils;
    expect(parseDefaults('not json')).toEqual({});
    expect(parseDefaults('[1,2]')).toEqual({});
    expect(parseDefaults('{"card-1": 5, "card-2": {"fromAccountId": 3, "note": ""}}')).toEqual({
      'card-2': { fromAccountId: null, note: null },
    });
  });
});
