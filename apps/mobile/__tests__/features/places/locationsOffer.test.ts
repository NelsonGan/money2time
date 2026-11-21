const mockStore = new Map<string, string>();
let mockStorageFails = false;
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => {
      if (mockStorageFails) throw new Error('storage full');
      return mockStore.get(key) ?? null;
    }),
    setItem: jest.fn(async (key: string, value: string) => {
      if (mockStorageFails) throw new Error('storage full');
      mockStore.set(key, value);
    }),
  },
}));

import {
  asksForLocationsOffer,
  hasPendingLocationsOffer,
  isLocationsOfferDone,
  LOCATIONS_OFFER_DONE_KEY,
  locationsOfferStep,
  markLocationsOfferDone,
  requestLocationsOffer,
  resetLocationsOffer,
  subscribeLocationsOffer,
  takePendingLocationsOffer,
} from '~/features/places/lib/locationsOffer';

beforeEach(() => {
  mockStore.clear();
  mockStorageFails = false;
  resetLocationsOffer();
});

describe('which entries ask for the Locations offer', () => {
  it('asks after an expense or income the user made on this phone', () => {
    for (const source of [undefined, 'manual', 'voice', 'receipt', 'split', 'receipt_split']) {
      expect(asksForLocationsOffer('expense', source, false)).toBe(true);
    }
    expect(asksForLocationsOffer('income', 'notification_review', false)).toBe(true);
  });

  it('never for automations, imports, the browser, transfers, or with Locations already on', () => {
    expect(asksForLocationsOffer('expense', 'autolog', false)).toBe(false);
    expect(asksForLocationsOffer('expense', 'statement_import', false)).toBe(false);
    expect(asksForLocationsOffer('expense', 'web_dashboard', false)).toBe(false);
    expect(asksForLocationsOffer('transfer', 'manual', false)).toBe(false);
    expect(asksForLocationsOffer('balance_adjustment', 'manual', false)).toBe(false);
    expect(asksForLocationsOffer('expense', 'manual', true)).toBe(false);
  });
});

describe('the request', () => {
  it('is one pending request however many entries ask, taken once', () => {
    const listener = jest.fn();
    subscribeLocationsOffer(listener);
    requestLocationsOffer();
    requestLocationsOffer();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasPendingLocationsOffer()).toBe(true);
    expect(takePendingLocationsOffer()).toBe(true);
    expect(takePendingLocationsOffer()).toBe(false);
  });

  it('is answered for good once shown or turned on, even when storage fails', async () => {
    expect(await isLocationsOfferDone()).toBe(false);
    requestLocationsOffer();
    await markLocationsOfferDone();
    expect(hasPendingLocationsOffer()).toBe(false);
    expect(await isLocationsOfferDone()).toBe(true);
    expect(mockStore.has(LOCATIONS_OFFER_DONE_KEY)).toBe(true);

    // A later launch reads it back from storage.
    resetLocationsOffer();
    expect(await isLocationsOfferDone()).toBe(true);

    // Storage failing: still never twice in this run.
    mockStore.clear();
    resetLocationsOffer();
    mockStorageFails = true;
    await markLocationsOfferDone();
    expect(await isLocationsOfferDone()).toBe(true);
  });
});

describe('show, wait or drop', () => {
  const ready = {
    pending: true,
    done: false,
    locationsEnabled: false,
    locationUnavailable: false,
    allowed: true,
    appActive: true,
    otherPromptVisible: false,
  };

  it('shows only when asked for, unanswered and the screen is free', () => {
    expect(locationsOfferStep(ready)).toBe('show');
  });

  it('drops a request with nothing left to offer', () => {
    expect(locationsOfferStep({ ...ready, pending: false })).toBe('drop');
    expect(locationsOfferStep({ ...ready, done: true })).toBe('drop');
    expect(locationsOfferStep({ ...ready, locationsEnabled: true })).toBe('drop');
    expect(locationsOfferStep({ ...ready, locationUnavailable: true })).toBe('drop');
    // Answered wins over everything that would only make it wait.
    expect(locationsOfferStep({ ...ready, done: true, otherPromptVisible: true })).toBe('drop');
  });

  it('waits, keeping the request, behind another prompt, a modal route, the lock or the background', () => {
    expect(locationsOfferStep({ ...ready, otherPromptVisible: true })).toBe('wait');
    expect(locationsOfferStep({ ...ready, allowed: false })).toBe('wait');
    expect(locationsOfferStep({ ...ready, appActive: false })).toBe('wait');
  });
});
