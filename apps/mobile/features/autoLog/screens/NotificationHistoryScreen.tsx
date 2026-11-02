import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { ListChecks, Pencil, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import {
  Button,
  HeaderIconButton,
  PromptSheet,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import type { RootStackParamList } from '~/navigation/rootStack';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import {
  type NotificationReviewSelection,
  resolveNotificationReviews,
  suggestNotificationCategory,
  undoNotificationAiReview,
} from '~/services/notificationReview';
import {
  getNotificationScanHistoryGeneration,
  isUnseenAiResult,
  markNotificationAiResultsSeen,
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

import { NotificationAiCard } from '../components/NotificationAiCard';
import { isPayableAccount } from '../lib/binding';

export function NotificationHistoryScreen({ onBack }: { onBack: () => void }) {
  const app = useApp();
  const { settings } = app;
  const colors = useThemeColors();
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
    } catch {
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
  const aiDone = history.filter(isUnseenAiResult);
  // "Done by AI" moves to Recent once the user has been here and left.
  const aiDoneIds = useRef<string[]>([]);
  aiDoneIds.current = aiDone.map((entry) => entry.id);
  useEffect(() => {
    const user = settings.appUserId;
    return () => {
      void markNotificationAiResultsSeen(user, aiDoneIds.current).catch(() => undefined);
    };
  }, [settings.appUserId]);
  // Undo needs the capture in the open ledger (and not yet pruned).
  const canUndo = (entry: NotificationScanHistoryEntry) =>
    !!entry.ai?.applied && !!paymentAlertCapturesRepository.getById(entry.id);
  const confirmUndo = (entry: NotificationScanHistoryEntry) => {
    const transaction = entry.transactionId
      ? transactionsRepository.getById(entry.transactionId)
      : null;
    const edited =
      !!transaction && Date.parse(transaction.updatedAt) - Date.parse(transaction.createdAt) > 2000;
    if (!edited) {
      void undo(entry);
      return;
    }
    Alert.alert(
      I18n.t('payment_alerts.ai_undo_edited_title'),
      I18n.t('payment_alerts.ai_undo_edited_body'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('payment_alerts.ai_undo'),
          style: 'destructive',
          onPress: () => void undo(entry),
        },
      ],
    );
  };
  const undo = async (entry: NotificationScanHistoryEntry) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    void triggerHaptic('selection');
    const snapshot = identity.current;
    try {
      const undone = await undoNotificationAiReview(entry.id, {
        appUserId: snapshot.user,
        generation: snapshot.generation,
        getCurrent: () => ({ ...live.current, appUserId: live.current.settings.appUserId }),
        deleteTransaction: (id) => live.current.deleteTransaction(id),
      });
      if (undone) {
        void trackEvent(AnalyticsEvents.NOTIFICATION_AI_REVIEW_UNDONE, {
          decision: entry.ai?.decision ?? 'unknown',
        });
      }
    } catch {
      Alert.alert(
        I18n.t('payment_alerts.history_title'),
        I18n.t('payment_alerts.review_save_error'),
      );
      reload();
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
  // Unseen AI results are in Done by AI; they join Recent once seen.
  const recent = history.filter((entry) => entry.result !== 'pending' && !isUnseenAiResult(entry));
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkLabel = I18n.t('payment_alerts.review_all', { count: pending.length });
  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <SettingsHeader
        onBack={onBack}
        title={I18n.t('payment_alerts.title')}
        rightAccessory={
          // One item has its own buttons; two or more can be decided at once.
          tab === 'pending' && pending.length > 1 ? (
            <HeaderIconButton
              label={bulkLabel}
              icon={<ListChecks size={18} color={colors.textMuted} />}
              onPress={() => setBulkOpen(true)}
            />
          ) : null
        }
      />
      <BulkReviewSheet
        visible={bulkOpen}
        title={bulkLabel}
        disabled={busy}
        onDismiss={() => setBulkOpen(false)}
        onAction={(action) => {
          setBulkOpen(false);
          void run(
            pending.map((entry) => entry.id),
            action,
          );
        }}
      />
      <NotificationAiCard />
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
            tab === 'pending' && aiDone.length > 0 ? (
              <DoneByAiGroup
                entries={aiDone}
                busy={busy}
                money={money}
                canUndo={canUndo}
                onUndo={confirmUndo}
              />
            ) : null
          }
          ListEmptyComponent={
            tab === 'pending' && aiDone.length > 0 ? null : (
              <EmptyState compact title={I18n.t('payment_alerts.history_empty')} />
            )
          }
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
              canUndo={canUndo(entry)}
              onUndo={() => confirmUndo(entry)}
            />
          )}
        />
      )}
    </SettingsPageLayout>
  );
}

const CHOICE_STYLES = {
  income: { box: 'bg-success/10', text: 'text-success', key: 'nav.income' },
  expense: { box: 'bg-destructive/10', text: 'text-destructive', key: 'nav.expense' },
  none: { box: 'bg-secondary', text: 'text-muted-foreground', key: 'payment_alerts.review_ignore' },
} as const;

/** Income / Expense / Ignore as soft pills: the card's (or the bulk sheet's) one decision. */
function ReviewChoices({
  disabled,
  incomeExpenseDisabled = false,
  all = false,
  onAction,
}: {
  disabled: boolean;
  incomeExpenseDisabled?: boolean;
  all?: boolean;
  onAction: (action: 'income' | 'expense' | 'none') => void;
}) {
  return (
    <View className="flex-row gap-2">
      {(['income', 'expense', 'none'] as const).map((action) => {
        const style = CHOICE_STYLES[action];
        const off = disabled || (action !== 'none' && incomeExpenseDisabled);
        return (
          <Button
            key={action}
            variant="ghost"
            bouncy={false}
            className={`h-11 flex-1 rounded-full px-2 ${style.box} ${off ? 'opacity-40' : ''}`}
            disabled={off}
            onPress={() => onAction(action)}
          >
            <Text variant="bodyStrong" numberOfLines={1} className={`text-[14px] ${style.text}`}>
              {I18n.t(
                all
                  ? `payment_alerts.review_${action === 'none' ? 'ignore' : action}_all`
                  : style.key,
              )}
            </Text>
          </Button>
        );
      })}
    </View>
  );
}

/** Decide every item in To review at once, from the header button. */
function BulkReviewSheet({
  visible,
  title,
  disabled,
  onDismiss,
  onAction,
}: {
  visible: boolean;
  title: string;
  disabled: boolean;
  onDismiss: () => void;
  onAction: (action: 'income' | 'expense' | 'none') => void;
}) {
  return (
    <PromptSheet visible={visible} onDismiss={onDismiss}>
      <View className="gap-4 p-5">
        <Text variant="subheading">{title}</Text>
        <ReviewChoices all disabled={disabled} onAction={onAction} />
        <Button variant="ghost" onPress={onDismiss}>
          <Text className="text-muted-foreground">{I18n.t('common.cancel')}</Text>
        </Button>
      </View>
    </PromptSheet>
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
  canUndo,
  onUndo,
}: {
  entry: NotificationScanHistoryEntry;
  selection?: NotificationReviewSelection;
  busy: boolean;
  money: (amount: number, currency: string) => string;
  onSelect: (selection: NotificationReviewSelection) => void;
  onEdit: () => void;
  onAction: (action: 'income' | 'expense' | 'none') => void;
  canUndo: boolean;
  onUndo: () => void;
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
    <View className="mx-auto mb-3 w-full max-w-[640px] gap-3 rounded-2xl bg-card p-4">
      <View className="gap-2">
        <View className="flex-row items-start gap-3">
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
          {pending ? (
            <View className="max-w-[55%] flex-row items-center">
              {selected.amount ? (
                <Text variant="subheading" numberOfLines={1} className="shrink">
                  {money(selected.amount.amount, selected.amount.currency)}
                </Text>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-1"
                disabled={busy}
                accessibilityLabel={I18n.t('common.edit')}
                onPress={onEdit}
              >
                <Pencil size={15} color={colors.textMuted} />
              </Button>
            </View>
          ) : (
            <View className="max-w-[55%] items-end">
              {/* An ignored notification moved no money; its figures may be a code or balance. */}
              {selected.amount && (entry.result === 'expense' || entry.result === 'income') ? (
                <Text variant="bodyStrong" tone={tone} numberOfLines={1}>
                  {money(selected.amount.amount, selected.amount.currency)}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-1">
                {entry.ai?.applied ? <Sparkles size={12} color={colors.textMuted} /> : null}
                <Text variant="caption" tone={tone}>
                  {label}
                </Text>
                {canUndo ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('payment_alerts.ai_undo')}
                    disabled={busy}
                    hitSlop={12}
                    onPress={onUndo}
                    className="ml-2"
                  >
                    <Text variant="caption" className="font-semibold text-primary">
                      {I18n.t('payment_alerts.ai_undo')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        </View>
        {pending && entry.ai && !entry.ai.undone ? <AiHint entry={entry} /> : null}
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
        <ReviewChoices
          disabled={busy}
          incomeExpenseDisabled={!selected.amount || !account}
          onAction={onAction}
        />
      ) : null}
    </View>
  );
}

/** AI's opinion on a notification it left for the user. */
function AiHint({ entry }: { entry: NotificationScanHistoryEntry }) {
  const colors = useThemeColors();
  const decision = entry.ai?.decision;
  const key =
    decision === 'expense' || decision === 'income'
      ? `payment_alerts.ai_hint_${decision}`
      : 'payment_alerts.ai_hint_unsure';
  return (
    <View className="flex-row items-center gap-1.5">
      <Sparkles size={13} color={colors.textMuted} />
      <Text variant="caption" tone="muted">
        {I18n.t(key)}
      </Text>
    </View>
  );
}

/** What AI just logged or ignored, each with Undo, until the user leaves the page. */
function DoneByAiGroup({
  entries,
  busy,
  money,
  canUndo,
  onUndo,
}: {
  entries: readonly NotificationScanHistoryEntry[];
  busy: boolean;
  money: (amount: number, currency: string) => string;
  canUndo: (entry: NotificationScanHistoryEntry) => boolean;
  onUndo: (entry: NotificationScanHistoryEntry) => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <View className="mx-auto mb-4 w-full max-w-[640px]">
      <View className="mb-1 flex-row items-center gap-1.5">
        <Sparkles size={13} color={colors.primary} />
        <Text variant="caption" tone="muted" className="font-semibold">
          {I18n.t('payment_alerts.ai_done_title')}
        </Text>
      </View>
      {entries.map((entry, index) => {
        const ignored = entry.result === 'none';
        const reason = entry.ai?.reason;
        return (
          <View
            key={entry.id}
            testID={`notification-ai-done-${index}`}
            className={index > 0 ? 'border-t border-border/40' : ''}
          >
            <View className="min-h-12 flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={I18n.t(
                  expanded === entry.id
                    ? 'payment_alerts.review_show_less'
                    : 'payment_alerts.review_show_more',
                )}
                onPress={() => setExpanded((value) => (value === entry.id ? null : entry.id))}
                className="flex-1 flex-row items-center gap-3 py-2"
              >
                <Text variant="body" numberOfLines={1} className="flex-1">
                  {entry.sourceLabel ?? I18n.t('payment_alerts.ios_notifications_title')}
                </Text>
                {ignored ? (
                  <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
                    {reason
                      ? `${I18n.t('payment_alerts.history_none')} · ${I18n.t(`payment_alerts.ai_reason_${reason}`)}`
                      : I18n.t('payment_alerts.history_none')}
                  </Text>
                ) : (
                  <>
                    {entry.selectedAmount ? (
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {money(entry.selectedAmount.amount, entry.selectedAmount.currency)}
                      </Text>
                    ) : null}
                    <Text
                      variant="caption"
                      tone={entry.result === 'income' ? 'success' : 'error'}
                      numberOfLines={1}
                    >
                      {I18n.t(entry.result === 'income' ? 'nav.income' : 'nav.expense')}
                    </Text>
                  </>
                )}
              </Pressable>
              {canUndo(entry) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('payment_alerts.ai_undo')}
                  disabled={busy}
                  hitSlop={10}
                  onPress={() => onUndo(entry)}
                  className="py-2 pl-2"
                >
                  <Text variant="caption" className="text-[13px] font-semibold text-primary">
                    {I18n.t('payment_alerts.ai_undo')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {expanded === entry.id ? (
              <Text variant="caption" tone="muted" className="pb-3">
                {entry.text}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
