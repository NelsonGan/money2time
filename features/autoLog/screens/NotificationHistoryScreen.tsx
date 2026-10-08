import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import {
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import {
  type NotificationScanHistoryEntry,
  readNotificationScanHistory,
  subscribeNotificationScanHistory,
} from '~/services/notificationScanHistory';
import { formatRelativeDate, formatTimeOfDay } from '~/utils/formatters';

export function NotificationHistoryScreen({ onBack }: { onBack: () => void }) {
  const { settings } = useApp();
  const bottomInset = useSettingsBottomNavInset();
  const [history, setHistory] = useState<NotificationScanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const reload = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setHistory([]);
    setFailed(false);
    const load = () => {
      void readNotificationScanHistory(settings.appUserId)
        .then((rows) => {
          if (active) {
            setHistory(rows);
            setFailed(false);
          }
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };
    const unsubscribe = subscribeNotificationScanHistory(settings.appUserId, load);
    load();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [settings.appUserId, retry]);
  return (
    <SettingsPageLayout>
      <SettingsHeader onBack={onBack} title={I18n.t('payment_alerts.history_title')} />
      <ScrollView className="flex-1" contentContainerStyle={bottomInset}>
        <View className="gap-3 px-5 pt-3 pb-6">
          <Text variant="caption" tone="muted">
            {I18n.t('payment_alerts.history_hint')}
          </Text>
          {loading ? (
            <View className="items-center py-16">
              <LoadingDots />
            </View>
          ) : failed ? (
            <EmptyState
              compact
              title={I18n.t('payment_alerts.history_error')}
              action={{ label: I18n.t('common.retry'), onPress: reload }}
            />
          ) : history.length === 0 ? (
            <EmptyState compact title={I18n.t('payment_alerts.history_empty')} />
          ) : (
            history.map((entry) => (
              <View
                key={entry.id}
                className="gap-3 rounded-2xl border border-border/30 bg-card p-4"
              >
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <Text variant="caption" tone="muted" className="shrink">
                    {entry.sourceLabel ?? I18n.t('payment_alerts.ios_notifications_title')}
                  </Text>
                  <Text
                    variant="caption"
                    tone={
                      entry.result === 'income'
                        ? 'success'
                        : entry.result === 'expense'
                          ? 'error'
                          : entry.result === 'failed'
                            ? 'warning'
                            : 'muted'
                    }
                  >
                    {I18n.t(
                      entry.result === 'expense'
                        ? 'nav.expense'
                        : entry.result === 'income'
                          ? 'nav.income'
                          : entry.result === 'none'
                            ? 'payment_alerts.history_none'
                            : 'payment_alerts.history_failed',
                    )}
                  </Text>
                </View>
                <Text>{entry.text}</Text>
                <Text variant="caption" tone="muted">
                  {formatRelativeDate(entry.capturedAt, settings.locale)} ·{' '}
                  {formatTimeOfDay(
                    new Date(entry.capturedAt).getHours(),
                    new Date(entry.capturedAt).getMinutes(),
                  )}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
