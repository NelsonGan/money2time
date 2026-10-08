import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import {
  AccountPickerSheet,
  Button,
  CurrencyPickerSheet,
  Input,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { countAccountsTowardFreeLimit } from '~/features/transactions/lib/accountEntryGate';
import { I18n } from '~/lib/i18n';
import {
  NotificationReviewAccountLimitError,
  type NotificationReviewSelection,
  resolveNotificationReviews,
} from '~/services/notificationReview';
import {
  getNotificationScanHistoryGeneration,
  type NotificationScanHistoryEntry,
  readNotificationScanHistory,
  subscribeNotificationScanHistory,
} from '~/services/notificationScanHistory';
import { formatAmount, formatRelativeDate, formatTimeOfDay } from '~/utils/formatters';
import { minorUnitDigits } from '~/utils/moneyText';
import { parseNotificationReviewAmount } from '~/utils/notificationAmounts';

import { isPayableAccount } from '../lib/binding';

export function NotificationHistoryScreen({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const isPro = useIsPro();
  const livePro = useRef(isPro);
  livePro.current = isPro;
  const { settings } = app;
  const navigation = useNavigation();
  const live = useRef(app);
  live.current = app;
  const [history, setHistory] = useState<NotificationScanHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
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
  const ordered = [...pending, ...history.filter((entry) => entry.result !== 'pending')];
  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <SettingsHeader onBack={onBack} title={I18n.t('payment_alerts.history_title')} />
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
          maintainVisibleContentPosition={{ disabled: true }}
          data={ordered}
          keyExtractor={(entry) => entry.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }}
          ListHeaderComponent={
            <View className="mx-auto w-full max-w-[640px] gap-3 pb-4">
              <Text variant="caption" tone="muted">
                {I18n.t('payment_alerts.history_hint')}
              </Text>
              {pending.length > 0 ? (
                <>
                  <Text variant="bodyStrong">
                    {I18n.t('payment_alerts.review_pending')} · {pending.length}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onPress={() => {
                        void run(
                          pending.map((entry) => entry.id),
                          'income',
                        );
                      }}
                    >
                      <Text>{I18n.t('payment_alerts.review_income_all')}</Text>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onPress={() => {
                        void run(
                          pending.map((entry) => entry.id),
                          'expense',
                        );
                      }}
                    >
                      <Text>{I18n.t('payment_alerts.review_expense_all')}</Text>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onPress={() => {
                        void run(
                          pending.map((entry) => entry.id),
                          'none',
                        );
                      }}
                    >
                      <Text>{I18n.t('payment_alerts.review_ignore_all')}</Text>
                    </Button>
                  </View>
                </>
              ) : null}
            </View>
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

function NotificationReviewCard({
  entry,
  selection,
  busy,
  money,
  onSelect,
  onAction,
}: {
  entry: NotificationScanHistoryEntry;
  selection?: NotificationReviewSelection;
  busy: boolean;
  money: (amount: number, currency: string) => string;
  onSelect: (selection: NotificationReviewSelection) => void;
  onAction: (action: 'income' | 'expense' | 'none') => void;
}) {
  const { accounts, accountGroups, settings } = useApp();
  const initialAmount =
    entry.selectedAmount ?? (entry.amounts?.length === 1 ? entry.amounts[0] : null);
  const selected = selection ?? { amount: initialAmount, accountId: entry.accountId ?? null };
  const [editedCurrency, setEditedCurrency] = useState<string | null>(null);
  const currency =
    editedCurrency ??
    selected.amount?.currency ??
    initialAmount?.currency ??
    accounts.find((account) => account.id === selected.accountId)?.currency ??
    settings.currencyCode;
  const [input, setInput] = useState(selected.amount ? String(selected.amount.amount) : '');
  const [expanded, setExpanded] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const pending = entry.result === 'pending';
  const account = accounts.find((item) => item.id === selected.accountId && isPayableAccount(item));
  return (
    <View className="mx-auto mb-3 w-full max-w-[640px] gap-3 rounded-2xl border border-border/40 bg-card p-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="caption" tone="muted">
          {entry.sourceLabel ?? I18n.t('payment_alerts.ios_notifications_title')}
        </Text>
        <Text
          variant="caption"
          tone={
            entry.result === 'income'
              ? 'success'
              : entry.result === 'expense'
                ? 'error'
                : pending
                  ? 'primary'
                  : 'muted'
          }
        >
          {I18n.t(
            pending
              ? 'payment_alerts.review_pending'
              : entry.result === 'expense'
                ? 'nav.expense'
                : entry.result === 'income'
                  ? 'nav.income'
                  : entry.result === 'none'
                    ? 'payment_alerts.history_none'
                    : 'payment_alerts.history_failed',
          )}
        </Text>
      </View>
      <Text numberOfLines={expanded ? undefined : 5}>{entry.text}</Text>
      {entry.text.length > 160 ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)}>
          <Text variant="caption" tone="primary">
            {I18n.t(
              expanded ? 'payment_alerts.review_show_less' : 'payment_alerts.review_show_more',
            )}
          </Text>
        </Pressable>
      ) : null}
      <Text variant="caption" tone="muted">
        {formatRelativeDate(entry.capturedAt, settings.locale)} ·{' '}
        {formatTimeOfDay(
          new Date(entry.capturedAt).getHours(),
          new Date(entry.capturedAt).getMinutes(),
        )}
      </Text>
      {pending ? (
        <>
          {(entry.amounts?.length ?? 0) > 1 ? (
            <View className="flex-row flex-wrap gap-2">
              {entry.amounts?.map((candidate) => (
                <Button
                  key={`${candidate.currency}:${candidate.amount}`}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onPress={() => {
                    setEditedCurrency(candidate.currency);
                    setInput(String(candidate.amount));
                    onSelect({ ...selected, amount: candidate });
                  }}
                >
                  <Text>{money(candidate.amount, candidate.currency)}</Text>
                </Button>
              ))}
            </View>
          ) : null}
          <Text variant="caption" tone="muted">
            {I18n.t('payment_alerts.review_amount_hint')}
          </Text>
          <View className="flex-row items-center gap-2">
            <Input
              containerClassName="flex-1"
              accessibilityLabel={I18n.t('transactions.editor.amount')}
              value={input}
              keyboardType="decimal-pad"
              editable={!busy}
              onChangeText={(text) => {
                setInput(text);
                onSelect({ ...selected, amount: parseNotificationReviewAmount(text, currency) });
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onPress={() => setCurrencyOpen(true)}
            >
              <Text>{currency}</Text>
            </Button>
          </View>
          <Button size="sm" variant="outline" disabled={busy} onPress={() => setAccountOpen(true)}>
            <Text numberOfLines={1}>
              {account?.name ?? I18n.t('transactions.editor.choose_account')}
            </Text>
          </Button>
          <View className="flex-row gap-2">
            <Button
              className="flex-1 px-2"
              size="sm"
              variant="secondary"
              disabled={busy || !selected.amount || !account}
              onPress={() => onAction('income')}
            >
              <Text>{I18n.t('nav.income')}</Text>
            </Button>
            <Button
              className="flex-1 px-2"
              size="sm"
              variant="secondary"
              disabled={busy || !selected.amount || !account}
              onPress={() => onAction('expense')}
            >
              <Text>{I18n.t('nav.expense')}</Text>
            </Button>
            <Button
              className="flex-1 px-2"
              size="sm"
              variant="outline"
              disabled={busy}
              onPress={() => onAction('none')}
            >
              <Text>{I18n.t('payment_alerts.review_ignore')}</Text>
            </Button>
          </View>
          <AccountPickerSheet
            visible={accountOpen}
            onClose={() => setAccountOpen(false)}
            accounts={accounts.filter(isPayableAccount)}
            accountGroups={accountGroups}
            selectedAccountId={selected.accountId}
            onSelect={(accountId) => {
              onSelect({ ...selected, accountId });
              setAccountOpen(false);
            }}
          />
          <CurrencyPickerSheet
            visible={currencyOpen}
            onClose={() => setCurrencyOpen(false)}
            selectedCode={currency}
            onSelect={(code) => {
              setEditedCurrency(code);
              onSelect({ ...selected, amount: parseNotificationReviewAmount(input, code) });
              setCurrencyOpen(false);
            }}
          />
        </>
      ) : entry.selectedAmount ? (
        <Text variant="bodyStrong">
          {money(entry.selectedAmount.amount, entry.selectedAmount.currency)}
        </Text>
      ) : null}
    </View>
  );
}
