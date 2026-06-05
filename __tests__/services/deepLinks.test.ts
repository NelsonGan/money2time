import { handleMoney2TimeDeepLink } from '~/services/deepLinks';
import { requestFocusInsight } from '~/services/insightsNavigation';
import { requestOpenTab } from '~/services/tabNavigation';

jest.mock('react-native', () => ({
  Linking: { addEventListener: jest.fn(), getInitialURL: jest.fn() },
}));

jest.mock('~/services/analytics', () => ({
  AnalyticsEvents: { SCREEN_VIEWED: 'screen_viewed' },
  trackEvent: jest.fn(),
}));

jest.mock('~/services/tabNavigation', () => ({
  requestOpenTab: jest.fn(),
}));

jest.mock('~/services/insightsNavigation', () => ({
  requestFocusInsight: jest.fn(),
}));

function makeNavigationRef(canGoBack = false) {
  return {
    navigate: jest.fn(),
    canGoBack: jest.fn(() => canGoBack),
  } as never;
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

  it('pops back to Main before switching tabs when a screen is pushed', () => {
    const ref = makeNavigationRef(true);
    handleMoney2TimeDeepLink('money2time://calendar', ref);
    expect((ref as unknown as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('Main');
  });

  it('still routes quick-add and pro deep links', () => {
    const ref = makeNavigationRef();
    expect(handleMoney2TimeDeepLink('money2time://quick-add?type=income', ref)).toBe(true);
    expect(handleMoney2TimeDeepLink('money2time://pro?source=widget_x', ref)).toBe(true);
    expect(requestOpenTab).not.toHaveBeenCalled();
  });

  it('returns false for unknown actions', () => {
    const ref = makeNavigationRef();
    expect(handleMoney2TimeDeepLink('money2time://open', ref)).toBe(false);
  });
});
