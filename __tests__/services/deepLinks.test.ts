import { requestRunAddAction } from '~/services/addActionNavigation';
import { handleMoney2TimeDeepLink } from '~/services/deepLinks';
import { requestFocusInsight } from '~/services/insightsNavigation';
import { requestReviewZoom } from '~/services/reviewNavigation';
import { consumePendingLiveEarningsStart } from '~/services/liveEarningsNavigation';
import { requestOpenTab } from '~/services/tabNavigation';

jest.mock('react-native', () => ({
  Linking: { addEventListener: jest.fn(), getInitialURL: jest.fn() },
  Keyboard: { dismiss: jest.fn() },
  InteractionManager: { runAfterInteractions: (cb: () => void) => cb() },
}));

jest.mock('~/services/analytics', () => ({
  AnalyticsEvents: { WIDGET_OPENED: 'widget_opened', BACK_TAP_TRIGGERED: 'back_tap_triggered' },
  trackEvent: jest.fn(),
}));

jest.mock('~/services/addActionNavigation', () => ({
  requestRunAddAction: jest.fn(),
}));

jest.mock('~/services/tabNavigation', () => ({
  requestOpenTab: jest.fn(),
}));

jest.mock('~/services/insightsNavigation', () => ({
  requestFocusInsight: jest.fn(),
}));

jest.mock('~/services/reviewNavigation', () => ({
  requestReviewZoom: jest.fn(),
  // The real module narrows the zoom param; keep that behaviour so a bad value
  // is still rejected rather than waved through by the mock.
  parseReviewZoomParam: (value: string | undefined) =>
    value === 'week' || value === 'month' || value === 'year' ? value : null,
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

  describe('Back Tap (money2time://add)', () => {
    it('runs the configured entry action', () => {
      for (const action of ['quick', 'full', 'scan', 'voice', 'split', 'splitScan']) {
        jest.clearAllMocks();
        const handled = handleMoney2TimeDeepLink(
          `money2time://add?action=${action}`,
          makeNavigationRef(),
        );
        expect(handled).toBe(true);
        expect(requestRunAddAction).toHaveBeenCalledWith(action);
      }
    });

    it('falls back to quick entry rather than no-opping on a missing or unknown action', () => {
      // A Back Tap that silently does nothing reads as a broken feature.
      for (const url of ['money2time://add', 'money2time://add?action=bogus']) {
        jest.clearAllMocks();
        expect(handleMoney2TimeDeepLink(url, makeNavigationRef())).toBe(true);
        expect(requestRunAddAction).toHaveBeenCalledWith('quick');
      }
    });

    it('resets to a clean root before running the action', () => {
      // Mirrors the widget behaviour: a modal left open from a previous tap
      // must not stack another entry sheet on top.
      const ref = makeNavigationRef(true);
      handleMoney2TimeDeepLink('money2time://add?action=quick', ref);
      expect(resetMock(ref)).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Main', key: 'main-1', params: undefined }],
      });
    });
  });

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

  // The weekly / monthly review reminders deep-link here when tapped.
  it('opens the review insight at the zoom the reminder recapped', () => {
    for (const zoom of ['week', 'month', 'year']) {
      jest.clearAllMocks();
      const ref = makeNavigationRef();
      const handled = handleMoney2TimeDeepLink(
        `money2time://insights?focus=review&zoom=${zoom}`,
        ref,
      );
      expect(handled).toBe(true);
      expect(requestOpenTab).toHaveBeenCalledWith('insights');
      expect(requestFocusInsight).toHaveBeenCalledWith('review');
      expect(requestReviewZoom).toHaveBeenCalledWith(zoom);
    }
  });

  it('still opens review when the reminder carries no zoom', () => {
    const ref = makeNavigationRef();
    handleMoney2TimeDeepLink('money2time://insights?focus=review', ref);
    expect(requestFocusInsight).toHaveBeenCalledWith('review');
    expect(requestReviewZoom).not.toHaveBeenCalled();
  });

  it('ignores a zoom it does not recognise', () => {
    const ref = makeNavigationRef();
    handleMoney2TimeDeepLink('money2time://insights?focus=review&zoom=decade', ref);
    expect(requestFocusInsight).toHaveBeenCalledWith('review');
    expect(requestReviewZoom).not.toHaveBeenCalled();
  });

  it('does not request a zoom for a non-review insight', () => {
    const ref = makeNavigationRef();
    handleMoney2TimeDeepLink('money2time://insights?focus=savings_rate&zoom=week', ref);
    expect(requestReviewZoom).not.toHaveBeenCalled();
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

  describe('live-earnings', () => {
    // The bridge is real here, not mocked: the pending start is the whole
    // contract between the reminder tap and the screen.
    afterEach(() => consumePendingLiveEarningsStart());

    it('opens the screen and leaves a pending start', () => {
      const ref = makeNavigationRef();
      expect(handleMoney2TimeDeepLink('money2time://live-earnings?start=1&hours=6', ref)).toBe(
        true,
      );
      expect(resetMock(ref)).toHaveBeenCalledWith({
        index: 1,
        routes: [
          { name: 'Main', key: 'main-1', params: undefined },
          { name: 'SettingsLiveEarnings', params: undefined },
        ],
      });
      expect(consumePendingLiveEarningsStart()).toEqual({ hours: 6 });
    });

    it('clamps an out-of-range duration to what iOS allows', () => {
      handleMoney2TimeDeepLink('money2time://live-earnings?start=1&hours=99', makeNavigationRef());
      expect(consumePendingLiveEarningsStart()).toEqual({ hours: 8 });
    });

    it('falls back to the minimum when the duration is missing or junk', () => {
      handleMoney2TimeDeepLink('money2time://live-earnings?start=1', makeNavigationRef());
      expect(consumePendingLiveEarningsStart()).toEqual({ hours: 1 });
    });

    it('opens the screen without starting anything when start is absent', () => {
      const ref = makeNavigationRef();
      expect(handleMoney2TimeDeepLink('money2time://live-earnings', ref)).toBe(true);
      expect(consumePendingLiveEarningsStart()).toBeNull();
    });

    it('a plain open clears a start left pending by an earlier tap', () => {
      handleMoney2TimeDeepLink('money2time://live-earnings?start=1&hours=4', makeNavigationRef());
      handleMoney2TimeDeepLink('money2time://live-earnings', makeNavigationRef());
      expect(consumePendingLiveEarningsStart()).toBeNull();
    });

    it('hands the pending start over exactly once', () => {
      handleMoney2TimeDeepLink('money2time://live-earnings?start=1&hours=3', makeNavigationRef());
      expect(consumePendingLiveEarningsStart()).toEqual({ hours: 3 });
      expect(consumePendingLiveEarningsStart()).toBeNull();
    });
  });
});
