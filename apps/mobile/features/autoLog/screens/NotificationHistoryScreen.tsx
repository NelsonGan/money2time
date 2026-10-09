import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ArrowDownLeft, ArrowUpRight, Bell, Pencil, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Button, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { countAccountsTowardFreeLimit } from '~/features/transactions/lib/accountEntryGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { RootStackParamList } from '~/navigation/rootStack';
import {
  NotificationReviewAccountLimitError,
  type NotificationReviewSelection,
  resolveNotificationReviews,
  suggestNotificationCategory,
} from '~/services/notificationReview';
import {
  getNotificationScanHistoryGeneration,
  type NotificationScanHistoryEntry,
  readNotificationScanHistory,
  subscribeNotificationScanHistory,
} from '~/services/notificationScanHistory';
import {
  dayKeyFromIsoLocal,
  formatAmount,
  formatRelativeDate,
  formatTimeOfDay,
} from '~/utils/formatters';
import { minorUnitDigits } from '~/utils/moneyText';

import { isPayableAccount } from '../lib/binding';

export function NotificationHistoryScreen({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const isPro = useIsPro();
  const livePro = useRef(isPro);
  livePro.current = isPro;
  const { settings } = app;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const live = useRef(app);
  live.current = app;
  const [history, setHistory] = useState<NotificationScanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'pending' | 'recent'>('pending');
  const busyRef = useRef(false);
  const [selections, setSelections] = useState<Record<string, NotificationReviewSelection>>({});
  const identity = useRef({
    user: settings.appUserId,
    generation: getNotificationScanHistoryGeneration(settings.appUserId),
  });
  const reload = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    identity.current = {
      user: settings.appUserId,
      generation: getNotificationScanHistoryGeneration(settings.appUserId),
    };
    setLoading(true);
    setHistory([]);
    setSelections({});
    setFailed(false);
    const load = () => {
      void readNotificationScanHistory(settings.appUserId)
        .then((rows) => {
          if (active) {
            identity.current.generation = getNotificationScanHistoryGeneration(settings.appUserId);
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
  const pending = history.filter((entry) => entry.result === 'pending');
  const run = async (ids: string[], action: 'income' | 'expense' | 'none'): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    const snapshot = identity.current;
    try {
      const outcome = await resolveNotificationReviews(
        ids,
        action,
        {
          appUserId: snapshot.user,
          generation: snapshot.generation,
          getCurrent: () => ({
            ...live.current,
            isPro: livePro.current,
            appUserId: live.current.settings.appUserId,
          }),
        },
        selections,
      );
      if (outcome.unfinished.length > 0) {
        Alert.alert(
          I18n.t('payment_alerts.review_pending'),
          I18n.t('payment_alerts.review_missing'),
        );
        return false;
      }
      return true;
    } catch (error) {
      if (error instanceof NotificationReviewAccountLimitError) {
        Alert.alert(
          I18n.t('pro.limit_reached_title'),
          I18n.t('add_action.over_account_limit_message', {
            active: countAccountsTowardFreeLimit(live.current.accounts),
            count: PRO_LIMITS.FREE_MAX_ACCOUNTS,
          }),
        );
        return false;
      }
      Alert.alert(
        I18n.t('payment_alerts.history_title'),
        I18n.t('payment_alerts.review_save_error'),
      );
      reload();
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  // Root-stack route: covers back button, hardware back and iOS swipe-back.
  // No bottom tabs remain visible, so switching tabs cannot bypass the warning.
  usePreventRemove(loading || pending.length > 0 || busy, ({ data }) => {
    if (busyRef.current || loading) return;
    const ids = pending.map((entry) => entry.id);
    Alert.alert(
      I18n.t('payment_alerts.review_leave_title'),
      I18n.t(
        ids.length === 1
          ? 'payment_alerts.review_leave_body_single'
          : 'payment_alerts.review_leave_body',
        { count: ids.length },
      ),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('payment_alerts.review_leave_confirm'),
          style: 'destructive',
          onPress: () => {
            void run(ids, 'none').then((ok) => {
              if (ok) navigation.dispatch(data.action);
            });
          },
        },
      ],
    );
  });
  const money = (amount: number, currency: string) =>
    minorUnitDigits(currency) === 3
      ? `${currency} ${amount.toLocaleString(settings.locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`
      : formatAmount(amount, { ...settings, displayMode: 'money' }, { currencyCode: currency });
  const recent = history.filter((entry) => entry.result !== 'pending');
  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <SettingsHeader onBack={onBack} title={I18n.t('payment_alerts.title')} />
      <View className="mx-auto w-full max-w-[640px] px-5 pb-3">
        <View className="flex-row rounded-xl bg-secondary p-1">
          {(['pending', 'recent'] as const).map((item) => (
            <Button
              key={item}
              variant="ghost"
              bouncy={false}
              className={`h-11 flex-1 gap-2 rounded-lg border-0 ${tab === item ? 'bg-card' : ''}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item }}
              onPress={() => setTab(item)}
            >
              <Text
                variant="bodyStrong"
                className={tab === item ? 'text-foreground' : 'text-muted-foreground'}
              >
                {I18n.t(`payment_alerts.review_${item}`)}
              </Text>
              {item === 'pending' && pending.length > 0 && (
                <View className="h-6 min-w-6 items-center justify-center rounded-md bg-destructive/10 px-1.5">
                  <Text variant="caption" className="text-[12px] font-semibold text-destructive">
                    {pending.length}
                  </Text>
                </View>
              )}
            </Button>
          ))}
        </View>
      </View>
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
      ) : (
        <FlashList
          key={tab}
          maintainVisibleContentPosition={{ disabled: true }}
          data={tab === 'pending' ? pending : recent}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          ListHeaderComponent={
            tab === 'pending' && pending.length > 0 ? (
              <View className="mx-auto mb-3 w-full max-w-[640px] flex-row border-b border-border/50 pb-2">
                {(['income', 'expense', 'none'] as const).map((action) => (
                  <ReviewAction
                    key={action}
                    action={action}
                    all
                    disabled={busy}
                    onPress={() => {
                      void run(
                        pending.map((entry) => entry.id),
                        action,
                      );
                    }}
                  />
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={<EmptyState compact title={I18n.t('payment_alerts.history_empty')} />}
          renderItem={({ item: entry }) => (
            <NotificationReviewCard
              key={entry.id}
              entry={entry}
              selection={selections[entry.id]}
              busy={busy}
              money={money}
              onSelect={(selection) =>
                setSelections((current) => ({ ...current, [entry.id]: selection }))
              }
              onEdit={() => {
                const selected = selections[entry.id];
                const amount = selected
                  ? selected.amount
                  : (entry.selectedAmount ??
                    (entry.amounts?.length === 1 ? entry.amounts[0] : null));
                const type =
                  app.categories.find((item) => item.id === entry.categoryId)?.type === 'income'
                    ? 'income'
                    : 'expense';
                navigation.navigate('NotificationReviewEditor', {
                  captureId: entry.id,
                  ...{ appUserId: identity.current.user, generation: identity.current.generation },
                  initialValues: {
                    type,
                    amount: amount ? String(amount.amount) : '',
                    currency: amount?.currency,
                    accountId: entry.accountId,
                    categoryId: suggestNotificationCategory(
                      entry,
                      type,
                      app.categories,
                      app.quickEntryPrefs,
                    ),
                    date: dayKeyFromIsoLocal(entry.capturedAt),
                    note: entry.sourceLabel ?? '',
                  },
                });
              }}
              onAction={(action) => {
                void run([entry.id], action);
              }}
            />
          )}
        />
      )}
    </SettingsPageLayout>
  );
}

function ReviewAction({
  action,
  all = false,
  disabled,
  onPress,
}: {
  action: 'income' | 'expense' | 'none';
  all?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const Icon = action === 'income' ? ArrowDownLeft : action === 'expense' ? ArrowUpRight : X;
  const tone = action === 'income' ? 'success' : action === 'expense' ? 'error' : 'muted';
  const color =
    action === 'income' ? colors.success : action === 'expense' ? colors.error : colors.textMuted;
  const key = all
    ? `payment_alerts.review_${action === 'none' ? 'ignore' : action}_all`
    : action === 'none'
      ? 'payment_alerts.review_ignore'
      : `nav.${action}`;
  return (
    <Button
      variant="ghost"
      bouncy={false}
      size="sm"
      className="h-auto min-h-11 flex-1 flex-wrap gap-1.5 px-1 py-2"
      disabled={disabled}
      onPress={onPress}
    >
      <Icon size={16} color={color} />
      <Text
        variant="caption"
        tone={tone}
        className={`text-[13px] font-semibold ${action === 'income' ? 'text-success' : action === 'expense' ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {I18n.t(key)}
      </Text>
    </Button>
  );
}

function NotificationReviewCard({
  entry,
  selection,
  busy,
  money,
  onSelect,
  onEdit,
  onAction,
}: {
  entry: NotificationScanHistoryEntry;
  selection?: NotificationReviewSelection;
  busy: boolean;
  money: (amount: number, currency: string) => string;
  onSelect: (selection: NotificationReviewSelection) => void;
  onEdit: () => void;
  onAction: (action: 'income' | 'expense' | 'none') => void;
}) {
  const { accounts, settings } = useApp();
  const colors = useThemeColors();
  const initialAmount =
    entry.selectedAmount ?? (entry.amounts?.length === 1 ? entry.amounts[0] : null);
  const selected = selection ?? { amount: initialAmount, accountId: entry.accountId ?? null };
  const [expanded, setExpanded] = useState(false);
  const pending = entry.result === 'pending';
  const account = accounts.find((item) => item.id === selected.accountId && isPayableAccount(item));
  const label = I18n.t(
    entry.result === 'expense'
      ? 'nav.expense'
      : entry.result === 'income'
        ? 'nav.income'
        : entry.result === 'none'
          ? 'payment_alerts.history_none'
          : 'payment_alerts.history_failed',
  );
  const tone =
    entry.result === 'income' ? 'success' : entry.result === 'expense' ? 'error' : 'muted';
  return (
    <View className="mx-auto mb-3 w-full max-w-[640px] rounded-2xl border border-border/40 bg-card">
      <View className="gap-2 p-4">
        <View className="flex-row items-center gap-3">
          <View className="h-9 w-9 items-center justify-center rounded-xl bg-secondary">
            <Bell size={17} color={colors.textMuted} />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {entry.sourceLabel ?? I18n.t('payment_alerts.ios_notifications_title')}
            </Text>
            <Text variant="caption" tone="muted">
              {formatRelativeDate(entry.capturedAt, settings.locale)} ·{' '}
              {formatTimeOfDay(
                new Date(entry.capturedAt).getHours(),
                new Date(entry.capturedAt).getMinutes(),
              )}
            </Text>
          </View>
          <View
            className={
              pending ? 'max-w-[55%] flex-row items-center gap-1' : 'max-w-[55%] items-end'
            }
          >
            {selected.amount ? (
              <Text
                variant={pending ? 'bodyStrong' : 'caption'}
                tone={pending ? 'default' : tone}
                numberOfLines={1}
                className="shrink"
              >
                {money(selected.amount.amount, selected.amount.currency)}
              </Text>
            ) : null}
            {pending ? (
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                accessibilityLabel={I18n.t('common.edit')}
                onPress={onEdit}
              >
                <Pencil size={16} color={colors.textMuted} />
              </Button>
            ) : (
              <Text variant="caption" tone={tone}>
                {label}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t(
            expanded ? 'payment_alerts.review_show_less' : 'payment_alerts.review_show_more',
          )}
          onPress={() => setExpanded((value) => !value)}
        >
          <Text
            variant={pending ? 'body' : 'caption'}
            tone="muted"
            numberOfLines={expanded ? undefined : pending ? 3 : 2}
          >
            {entry.text}
          </Text>
        </Pressable>
        {pending && (entry.amounts?.length ?? 0) > 1 ? (
          <View className="flex-row flex-wrap gap-2">
            {entry.amounts?.map((candidate) => (
              <Button
                key={`${candidate.currency}:${candidate.amount}`}
                variant="ghost"
                size="sm"
                className={`min-h-11 rounded-lg border px-3 ${selected.amount?.currency === candidate.currency && selected.amount.amount === candidate.amount ? 'border-primary/40 bg-primary/10' : 'border-border/50'}`}
                disabled={busy}
                onPress={() => {
                  onSelect({ ...selected, amount: candidate });
                }}
              >
                <Text variant="caption">{money(candidate.amount, candidate.currency)}</Text>
              </Button>
            ))}
          </View>
        ) : null}
      </View>
      {pending ? (
        <View className="flex-row border-t border-border/40 px-2">
          <ReviewAction
            action="income"
            disabled={busy || !selected.amount || !account}
            onPress={() => onAction('income')}
          />
          <ReviewAction
            action="expense"
            disabled={busy || !selected.amount || !account}
            onPress={() => onAction('expense')}
          />
          <ReviewAction action="none" disabled={busy} onPress={() => onAction('none')} />
        </View>
      ) : null}
    </View>
  );
}
