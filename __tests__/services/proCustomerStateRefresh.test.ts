import { createProCustomerStateRefresh } from '~/services/proCustomerStateRefresh';
import type { RevenueCatCustomerState } from '~/services/revenueCat.shared';

const pro: RevenueCatCustomerState = {
  activatedAt: '2026-01-01T00:00:00Z',
  activeProductIdentifier: 'pro_lifetime',
  expirationDate: null,
  latestPurchaseDate: '2026-01-01T00:00:00Z',
  hasRenewingSubscription: false,
};
const free = { ...pro, activeProductIdentifier: null };

function deferred() {
  let resolve!: (value: RevenueCatCustomerState | null) => void;
  const promise = new Promise<RevenueCatCustomerState | null>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it('keeps restored Pro when an older foreground refresh finishes later', async () => {
  const request = deferred();
  const apply = jest.fn();
  const state = createProCustomerStateRefresh(() => request.promise, apply);
  const refresh = state.refresh();
  state.apply(pro);
  request.resolve(free);
  await refresh;
  expect(apply.mock.calls).toEqual([[pro]]);
});

it('keeps a revocation from the SDK listener when an older Pro refresh completes', async () => {
  const request = deferred();
  const apply = jest.fn();
  const state = createProCustomerStateRefresh(() => request.promise, apply);
  const refresh = state.refresh();
  state.apply(free);
  request.resolve(pro);
  await refresh;
  expect(apply.mock.calls).toEqual([[free]]);
});

it('uses the newest refresh when responses arrive out of order', async () => {
  const oldRequest = deferred();
  const newRequest = deferred();
  const fetchState = jest
    .fn()
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);
  const apply = jest.fn();
  const state = createProCustomerStateRefresh(fetchState, apply);
  const oldRefresh = state.refresh();
  const newRefresh = state.refresh();
  newRequest.resolve(pro);
  await newRefresh;
  oldRequest.resolve(free);
  await oldRefresh;
  expect(apply.mock.calls).toEqual([[pro]]);
});

it('preserves the last known access on a failed fetch, but accepts a confirmed free result', async () => {
  const fetchState = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(free);
  const apply = jest.fn();
  const state = createProCustomerStateRefresh(fetchState, apply);
  state.apply(pro);
  await state.refresh();
  expect(apply.mock.calls).toEqual([[pro]]);
  await state.refresh();
  expect(apply.mock.calls).toEqual([[pro], [free]]);
});

it('invalidates old customer reads when the app identity is reset', async () => {
  const request = deferred();
  const apply = jest.fn();
  const state = createProCustomerStateRefresh(() => request.promise, apply);
  const refresh = state.refresh();
  state.apply(null);
  request.resolve(pro);
  await refresh;
  expect(apply.mock.calls).toEqual([[null]]);
});
