import type { NavigationContainerRefWithCurrent } from '@react-navigation/native';
import { Linking } from 'react-native';

import type { RootStackParamList } from '~/navigation/rootStack';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';

type RootNavigationRef = NavigationContainerRefWithCurrent<RootStackParamList>;

let handledInitialUrl: string | null = null;

interface ParsedDeepLink {
  action: string;
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
  const action = pathPart.replace(/^\/+/, '').replace(/\/+$/, '').split('/')[0];
  if (!action) return null;

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

  return { action, params };
}

function normalizeQuickEntryType(value: string | undefined) {
  return value === 'income' || value === 'expense' ? value : null;
}

export function handleMoney2TimeDeepLink(url: string, navigationRef: RootNavigationRef): boolean {
  const parsed = parseMoney2TimeUrl(url);
  if (!parsed) return false;

  if (parsed.action === 'quick-add') {
    const type = normalizeQuickEntryType(parsed.params.type);
    if (!type) return false;

    navigationRef.navigate('AddTransaction', { initialValues: { type } });
    void trackEvent(AnalyticsEvents.SCREEN_VIEWED, {
      screen: 'widget_quick_add',
      type,
    });
    return true;
  }

  if (parsed.action === 'pro') {
    const source = parsed.params.source ?? 'widget';
    navigationRef.navigate('ProPaywall', { source });
    return true;
  }

  return false;
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
