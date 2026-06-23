import { handleMoney2TimeDeepLink } from '~/services/deepLinks';
import { requestFocusInsight } from '~/services/insightsNavigation';
import { requestOpenTab } from '~/services/tabNavigation';

jest.mock('react-native', () => ({
  Linking: { addEventListener: jest.fn(), getInitialURL: jest.fn() },
  Keyboard: { dismiss: jest.fn() },
  InteractionManager: { runAfterInteractions: (cb: () => void) => cb() },
}));

jest.mock('~/services/analytics', () => ({
  AnalyticsEvents: { WIDGET_OPENED: 'widget_opened' },
  trackEvent: jest.fn(),
}));

jest.mock('~/services/tabNavigation', () => ({
  requestOpenTab: jest.fn(),
}));

jest.mock('~/services/insightsNavigation', () => ({
  requestFocusInsight: jest.fn(),
}));

function makeNavigationRef(modalOpen = false) {
  // Mimics the root stack: just [Main] at rest, or [Main, AddTransaction] when a
  // modal (e.g. the quick-entry sheet) is already open from a prior widget tap.
  const routes = modalOpen
    ? [
        { name: 'Main', key: 'main-1' },
        { name: 'AddTransaction', key: 'add-1' },
      ]
    : [{ name: 'Main', key: 'main-1' }];
  return {
    navigate: jest.fn(),
    reset: jest.fn(),
    canGoBack: jest.fn(() => modalOpen),
    getRootState: jest.fn(() => ({ index: routes.length - 1, routes })),
  } as never;
}

function resetMock(ref: unknown) {
  return (ref as { reset: jest.Mock }).reset;
}

describe('handleMoney2TimeDeepLink', () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the insights tab for the weekly-expense widget', () => {
    const ref = makeNavigationRef();
    const handled = handleMoney2TimeDeepLink('money2time://insights', ref);
    expect(handled).toBe(true);
    expect(requestOpenTab).toHaveBeenCalledWith('insights');
  });

  it('opens the calendar tab for the calendar widget', () => {
    const ref = makeNavigationRef();
    const handled = handleMoney2TimeDeepLink('money2time://calendar', ref);
    expect(handled).toBe(true);
    expect(requestOpenTab).toHaveBeenCalledWith('calendar');
  });

  it('focuses the savings-rate insight for the savings widget', () => {
    const ref = makeNavigationRef();
    const handled = handleMoney2TimeDeepLink('money2time://insights?focus=savings_rate', ref);
    expect(handled).toBe(true);
    expect(requestOpenTab).toHaveBeenCalledWith('insights');
    expect(requestFocusInsight).toHaveBeenCalledWith('savings_rate');
  });

  it('opens insights without focusing when no focus param is present', () => {
    const ref = makeNavigationRef();
    handleMoney2TimeDeepLink('money2time://insights', ref);
    expect(requestOpenTab).toHaveBeenCalledWith('insights');
    expect(requestFocusInsight).not.toHaveBeenCalled();
  });

  it('resets the stack to Main before switching tabs when a modal is open', () => {
    const ref = makeNavigationRef(true);
    handleMoney2TimeDeepLink('money2time://calendar', ref);
    expect(resetMock(ref)).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Main', key: 'main-1', params: undefined }],
    });
  });

  it('still routes quick-add and pro deep links', () => {
    const ref = makeNavigationRef();
    expect(handleMoney2TimeDeepLink('money2time://quick-add?type=income', ref)).toBe(true);
    expect(handleMoney2TimeDeepLink('money2time://pro?source=widget_x', ref)).toBe(true);
    expect(requestOpenTab).not.toHaveBeenCalled();
  });

  it('replaces an open modal with a single fresh quick-add modal', () => {
    const ref = makeNavigationRef(true);
    handleMoney2TimeDeepLink('money2time://quick-add?type=expense', ref);
    // Exactly [Main, AddTransaction] — the prior modal is dropped, not stacked.
    expect(resetMock(ref)).toHaveBeenCalledWith({
      index: 1,
      routes: [
        { name: 'Main', key: 'main-1', params: undefined },
        { name: 'AddTransaction', params: { initialValues: { type: 'expense' } } },
      ],
    });
  });

  it('returns false for unknown actions', () => {
    const ref = makeNavigationRef();
    expect(handleMoney2TimeDeepLink('money2time://open', ref)).toBe(false);
  });
});
