const store = new Map<string, string>();
const setAlternateAppIcon = jest.fn(async () => undefined);
let currentName: string | null = null;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => store.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
  },
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-alternate-app-icons', () => ({
  supportsAlternateIcons: true,
  getAppIconName: () => currentName,
  setAlternateAppIcon: (name: string | null) => setAlternateAppIcon(name as never),
}));

import { syncAppIcon } from '~/services/appIcon.native';

describe('syncAppIcon on Android', () => {
  beforeEach(() => {
    store.clear();
    setAlternateAppIcon.mockClear();
    currentName = null;
  });

  it('switches the launcher when this install has never applied the stored choice', async () => {
    await syncAppIcon('purse');
    expect(setAlternateAppIcon).toHaveBeenCalledTimes(1);
  });

  it('does not touch the launcher again when launched through MainActivity after a switch', async () => {
    await syncAppIcon('purse');
    setAlternateAppIcon.mockClear();
    currentName = null; // deep link into MainActivity reads as default
    await syncAppIcon('purse');
    expect(setAlternateAppIcon).not.toHaveBeenCalled();
  });
});
