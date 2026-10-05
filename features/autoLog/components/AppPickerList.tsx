import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Image, Switch, View } from 'react-native';

import { ClayIcon, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  getInstalledAppInfo,
  type InstalledAppInfo,
  readSeenApps,
} from '~/services/paymentCapture';

import type { SeenApp } from '../lib/captureQueue';
import { PAYMENT_APPS } from '../lib/paymentApps';

/** How often the open picker re-reads the apps seen notifying. */
const SEEN_REFRESH_MS = 3000;

export interface PickableApp {
  package: string;
  label: string;
  iconUri: string | null;
}

interface AppPickerListProps {
  selected: ReadonlySet<string>;
  onToggle: (app: PickableApp, on: boolean) => void;
  /** Rendered under a selected app (its "Pays from" control). */
  renderSelectedDetail?: (app: PickableApp) => React.ReactNode;
}

/**
 * Android: the apps to read payment notifications from. "Suggested" are known
 * banking and wallet apps that are installed (declared in the plugin's
 * <queries>, so no broad package visibility is needed); "Recently active" are
 * apps the listener has seen post a notification (labels only, never content).
 */
export function AppPickerList({ selected, onToggle, renderSelectedDetail }: AppPickerListProps) {
  const themeColors = useThemeColors();
  const [installed, setInstalled] = useState<InstalledAppInfo[]>([]);
  const [seen, setSeen] = useState<SeenApp[]>([]);
  const [seenInfo, setSeenInfo] = useState<Map<string, InstalledAppInfo>>(new Map());

  const refresh = useCallback(() => {
    void getInstalledAppInfo(PAYMENT_APPS.map((app) => app.package)).then(setInstalled);
    setSeen(readSeenApps());
  }, []);

  // Labels and icons for whatever the seen list holds now.
  useEffect(() => {
    let cancelled = false;
    void getInstalledAppInfo(seen.map((app) => app.package)).then((info) => {
      if (!cancelled) setSeenInfo(new Map(info.map((item) => [item.package, item])));
    });
    return () => {
      cancelled = true;
    };
  }, [seen]);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // A bank app that notifies while this list is open (a payment made to set
  // this up, say) should appear without leaving the screen. Reading the seen
  // list is one small file, and only it can change here.
  useEffect(() => {
    const timer = setInterval(() => {
      const recent = readSeenApps();
      setSeen((previous) =>
        previous.length === recent.length &&
        previous.every((app, index) => app.package === recent[index]?.package)
          ? previous
          : recent,
      );
    }, SEEN_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const suggested = useMemo<PickableApp[]>(
    () =>
      installed.map((info) => ({
        package: info.package,
        label:
          info.label ||
          PAYMENT_APPS.find((app) => app.package === info.package)?.name ||
          info.package,
        iconUri: info.iconUri,
      })),
    [installed],
  );
  const recent = useMemo<PickableApp[]>(() => {
    const suggestedSet = new Set(suggested.map((app) => app.package));
    return seen
      .filter((app) => !suggestedSet.has(app.package))
      .map((app) => ({
        package: app.package,
        label: seenInfo.get(app.package)?.label || app.label,
        iconUri: seenInfo.get(app.package)?.iconUri ?? null,
      }));
  }, [seen, seenInfo, suggested]);

  // Apps already chosen that neither list shows (uninstalled, or not seen yet).
  const others = useMemo<PickableApp[]>(() => {
    const shown = new Set([...suggested, ...recent].map((app) => app.package));
    return [...selected]
      .filter((pkg) => !shown.has(pkg))
      .map((pkg) => ({
        package: pkg,
        label: PAYMENT_APPS.find((app) => app.package === pkg)?.name ?? pkg,
        iconUri: null,
      }));
  }, [recent, selected, suggested]);

  const renderRow = (app: PickableApp) => {
    const on = selected.has(app.package);
    return (
      <View key={app.package} className="gap-3 px-4 py-3">
        <View className="flex-row items-center gap-3">
          {app.iconUri ? (
            <Image source={{ uri: app.iconUri }} className="h-9 w-9 rounded-xl" />
          ) : (
            <View className="h-9 w-9 items-center justify-center">
              <ClayIcon name="money-time/card" size={30} flatSize={20} />
            </View>
          )}
          <Text variant="body" className="flex-1 text-foreground" numberOfLines={1}>
            {app.label}
          </Text>
          <Switch
            value={on}
            onValueChange={(value) => {
              void triggerHaptic('selection');
              onToggle(app, value);
            }}
            trackColor={{ false: themeColors.border, true: themeColors.primary }}
          />
        </View>
        {on && renderSelectedDetail ? renderSelectedDetail(app) : null}
      </View>
    );
  };

  const section = (title: string, apps: PickableApp[], hint?: string) =>
    apps.length > 0 || hint ? (
      <View className="gap-2">
        <View className="gap-1 px-1">
          <Text variant="caption" tone="muted">
            {title}
          </Text>
          {hint ? (
            <Text variant="caption" tone="muted">
              {hint}
            </Text>
          ) : null}
        </View>
        {apps.length > 0 ? (
          <View className="overflow-hidden rounded-2xl border border-border/30 bg-card">
            {apps.map((app, index) => (
              <View key={app.package}>
                {index > 0 ? <View className="ml-4 h-px bg-border/40" /> : null}
                {renderRow(app)}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    ) : null;

  return (
    <View className="gap-5">
      {section(I18n.t('payment_alerts.apps_suggested'), suggested)}
      {section(
        I18n.t('payment_alerts.apps_recent'),
        recent,
        I18n.t('payment_alerts.apps_missing_hint'),
      )}
      {section(I18n.t('payment_alerts.apps_other'), others)}
    </View>
  );
}
