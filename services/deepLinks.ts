import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { InteractionManager, Keyboard, Linking } from 'react-native';

import { getTutorial } from '~/features/tutorials/content/tutorials';
import { clampSessionHours } from '~/features/widgets/lib/liveEarnings';
import type { RootStackParamList } from '~/navigation/rootStack';
import { requestRunAddAction } from '~/services/addActionNavigation';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { requestFocusInsight } from '~/services/insightsNavigation';
import {
  clearPendingLiveEarningsStart,
  requestStartLiveEarnings,
} from '~/services/liveEarningsNavigation';
import { parseReviewZoomParam, requestReviewZoom } from '~/services/reviewNavigation';
import { requestOpenTab } from '~/services/tabNavigation';
import { ADD_BUTTON_ACTIONS, type AddButtonAction } from '~/types';

type RootNavigationRef = NavigationContainerRefWithCurrent<RootStackParamList>;

let handledInitialUrl: string | null = null;

interface ParsedDeepLink {
  action: string;
  /** Path segments after the action, e.g. `['albums']` for `tutorial/albums`. */
  rest: string[];
  params: Record<string, string>;
}

// React Native's global `URL` does not reliably expose `searchParams`, so we
// parse the deep link by hand instead of depending on it. Handles both
// `money2time://action?query` and `money2time:action?query` shapes.
function parseMoney2TimeUrl(url: string): ParsedDeepLink | null {
  if (typeof url !== 'string' || url.length === 0) return null;

  const schemeSplit = url.indexOf('://');
  let remainder: string;
  if (schemeSplit >= 0) {
    remainder = url.slice(schemeSplit + 3);
  } else {
    const colon = url.indexOf(':');
    if (colon < 0) return null;
    remainder = url.slice(colon + 1);
  }

  const [pathPart, queryPart = ''] = remainder.split('?');
  const segments = pathPart.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);
  const action = segments[0];
  if (!action) return null;
  const rest = segments.slice(1);

  const params: Record<string, string> = {};
  for (const pair of queryPart.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
    const rawValue = eq >= 0 ? pair.slice(eq + 1) : '';
    try {
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
    } catch {
      params[rawKey] = rawValue;
    }
  }

  return { action, rest, params };
}

function normalizeQuickEntryType(value: string | undefined) {
  return value === 'income' || value === 'expense' ? value : null;
}

function normalizeBackTapAction(value: string | undefined): AddButtonAction | null {
  return ADD_BUTTON_ACTIONS.includes(value as AddButtonAction) ? (value as AddButtonAction) : null;
}

export function handleMoney2TimeDeepLink(url: string, navigationRef: RootNavigationRef): boolean {
  const parsed = parseMoney2TimeUrl(url);
  if (!parsed) return false;

  if (parsed.action === 'quick-add') {
    const type = normalizeQuickEntryType(parsed.params.type);
    if (!type) return false;

    runDeepLinkNavigation(navigationRef, {
      name: 'AddTransaction',
      params: { initialValues: { type } },
    });
    void trackEvent(AnalyticsEvents.WIDGET_OPENED, {
      widget: 'quick_add',
      type,
    });
    return true;
  }

  // `money2time://add?action=quick|full|scan|voice` — the iOS Back Tap
  // shortcut. The intent reads the user's configured action from the App Group
  // catalog and puts it here; an unknown or missing action falls back to quick
  // entry rather than doing nothing, since a gesture that silently no-ops reads
  // as broken.
  if (parsed.action === 'add') {
    const action = normalizeBackTapAction(parsed.params.action) ?? 'quick';
    runDeepLinkNavigation(navigationRef, null, () => {
      requestRunAddAction(action);
    });
    void trackEvent(AnalyticsEvents.BACK_TAP_TRIGGERED, { action });
    return true;
  }

  if (parsed.action === 'budget') {
    // Budget is an Insights page now, so open the Insights tab focused on it
    // rather than a dedicated screen.
    runDeepLinkNavigation(navigationRef, null, () => {
      requestOpenTab('insights');
      requestFocusInsight('budget');
    });
    void trackEvent(AnalyticsEvents.WIDGET_OPENED, { widget: 'budget' });
    return true;
  }

  // `money2time://tutorial?id=<slug>` (and the path form `tutorial/<slug>`)
  // opens one tutorial; with no id, or an id that is not in the catalog, it
  // falls back to the list rather than doing nothing. The website's
  // /tutorials/<slug> page hands over the same id, so a link shared with a user
  // lands on the right page whether or not they have the app.
  if (parsed.action === 'tutorial' || parsed.action === 'tutorials') {
    const id = parsed.params.id ?? parsed.rest[0];
    const tutorial = getTutorial(id);
    if (tutorial) {
      runDeepLinkNavigation(navigationRef, {
        name: 'TutorialDetail',
        params: { id: tutorial.id },
      });
      void trackEvent(AnalyticsEvents.TUTORIAL_OPENED, { tutorial: tutorial.id, source: 'link' });
    } else {
      runDeepLinkNavigation(navigationRef, { name: 'Tutorials' });
      void trackEvent(AnalyticsEvents.TUTORIAL_LIST_OPENED, { source: 'link' });
    }
    return true;
  }

  // `money2time://live-earnings?start=1&hours=<n>` — the auto-start reminder.
  // iOS will not let a scheduled job raise a Live Activity, so the reminder
  // brings the user here and the screen starts the clock on arrival. Without
  // `start=1` the link only opens the screen.
  if (parsed.action === 'live-earnings') {
    if (parsed.params.start === '1') {
      const hours = Number.parseInt(parsed.params.hours ?? '', 10);
      requestStartLiveEarnings(clampSessionHours(hours));
    } else {
      // A plain open must not inherit a start left pending by an earlier tap.
      clearPendingLiveEarningsStart();
    }
    runDeepLinkNavigation(navigationRef, { name: 'SettingsLiveEarnings' });
    void trackEvent(AnalyticsEvents.WIDGET_OPENED, {
      widget: 'live_earnings',
      ...(parsed.params.start === '1' ? { source: 'schedule' } : {}),
    });
    return true;
  }

  if (parsed.action === 'pro') {
    const source = parsed.params.source ?? 'widget';
    runDeepLinkNavigation(navigationRef, { name: 'ProPaywall', params: { source } });
    return true;
  }

  if (parsed.action === 'insights' || parsed.action === 'calendar') {
    const tab = parsed.action === 'calendar' ? 'calendar' : 'insights';
    const reviewZoom = parseReviewZoomParam(parsed.params.zoom);
    runDeepLinkNavigation(navigationRef, null, () => {
      requestOpenTab(tab);
      // `money2time://insights?focus=savings_rate` selects a specific insight.
      if (tab === 'insights' && parsed.params.focus) {
        requestFocusInsight(parsed.params.focus);
        // A review reminder also names the zoom it recapped, so the page opens
        // on the week/month that just closed rather than the last one viewed.
        if (parsed.params.focus === 'review' && reviewZoom) {
          requestReviewZoom(reviewZoom);
        }
      }
    });
    void trackEvent(AnalyticsEvents.WIDGET_OPENED, {
      widget: parsed.action,
      ...(parsed.params.focus ? { focus: parsed.params.focus } : {}),
    });
    return true;
  }

  return false;
}

type DeepLinkModal = { name: keyof RootStackParamList; params?: object };

// A deep link can arrive while a modal (e.g. the quick-entry sheet) is open —
// often with the keyboard up after backgrounding the app mid-entry, and a
// second widget tap can stack another modal on top. A widget tap should always
// land on a clean root, so we rebuild the stack as exactly [Main] (+ the target
// modal) rather than popping/pushing, which is non-deterministic while a modal
// is animating. The existing Main route is reused so its tab state — and the
// `requestOpenTab` listener — survive the reset instead of remounting.
//
// On iOS, mutating the stack while a TextInput is focused races with the
// keyboard dismissal and can leave the old sheet stuck, so we dismiss the
// keyboard first and defer the reset until in-flight interactions settle.
function runDeepLinkNavigation(
  navigationRef: RootNavigationRef,
  modal: DeepLinkModal | null,
  afterReset?: () => void,
) {
  Keyboard.dismiss();
  InteractionManager.runAfterInteractions(() => {
    const rootState = navigationRef.getRootState();
    const existingMain = rootState?.routes.find((route) => route.name === 'Main');
    const mainRoute = existingMain
      ? { name: 'Main', key: existingMain.key, params: existingMain.params }
      : { name: 'Main' };
    const routes = modal ? [mainRoute, { name: modal.name, params: modal.params }] : [mainRoute];
    navigationRef.reset({ index: routes.length - 1, routes });
    afterReset?.();
  });
}

export function subscribeMoney2TimeDeepLinks(navigationRef: RootNavigationRef) {
  const subscription = Linking.addEventListener('url', ({ url }) => {
    handleMoney2TimeDeepLink(url, navigationRef);
  });

  void Linking.getInitialURL().then((url) => {
    if (!url) return;
    if (handledInitialUrl === url) return;
    handledInitialUrl = url;
    handleMoney2TimeDeepLink(url, navigationRef);
  });

  return () => subscription.remove();
}
