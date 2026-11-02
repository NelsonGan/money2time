import { useNavigation, usePreventRemove } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Pencil,
  Undo2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import {
  Button,
  CategoryEmoji,
  ClayIcon,
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
  // While Undo runs, its transaction is already gone but history still lists the
  // result: hide that row until the notification is back in To review, so it
  // never flashes as an empty, uncategorised entry.
  const [undoingId, setUndoingId] = useState<string | null>(null);
  useEffect(() => {
    if (
      undoingId &&
      history.some((entry) => entry.id === undoingId && entry.result === 'pending')
    ) {
      setUndoingId(null);
    }
  }, [history, undoingId]);
  const shown = (entry: NotificationScanHistoryEntry) =>
    entry.id !== undoingId || entry.result === 'pending';
  const aiDone = history.filter((entry) => isUnseenAiResult(entry) && shown(entry));
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
    setUndoingId(entry.id);
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
      } else {
        setUndoingId(null);
      }
    } catch {
      setUndoingId(null);
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
  const recent = history.filter(
    (entry) => entry.result !== 'pending' && !isUnseenAiResult(entry) && shown(entry),
  );
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
      <View className="mx-auto mb-3 w-full max-w-[640px] px-5">
        <View accessibilityRole="tablist" className="flex-row border-b border-border/60">
          {(['pending', 'recent'] as const).map((item) => {
            const selected = tab === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                testID={`notification-tab-${item}`}
                onPress={() => {
                  if (!selected) void triggerHaptic('selection');
                  setTab(item);
                }}
                className="h-11 flex-1 items-center justify-center"
              >
                <View className="flex-row items-center gap-1.5">
                  <Text
                    variant="bodyStrong"
                    className={selected ? 'text-foreground' : 'text-muted-foreground'}
                  >
                    {I18n.t(
                      item === 'pending'
                        ? 'payment_alerts.review_pending'
                        : 'payment_alerts.history',
                    )}
                  </Text>
                  {item === 'pending' && pending.length > 0 ? (
                    <Text
                      variant="bodyStrong"
                      className={selected ? 'text-primary' : 'text-muted-foreground'}
                    >
                      {pending.length}
                    </Text>
                  ) : null}
                </View>
                <View
                  className={`absolute -bottom-px left-6 right-6 h-0.5 rounded-full ${
                    selected ? 'bg-primary' : 'bg-transparent'
                  }`}
                />
              </Pressable>
            );
          })}
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
          data={withDayLabels(tab === 'pending' ? pending : recent, settings.locale)}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.kind}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
          ListHeaderComponent={
            tab === 'pending' && aiDone.length > 0 ? (
              <SortedGroup
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
          renderItem={({ item: row }) =>
            row.kind === 'day' ? (
              <Text
                variant="caption"
                tone="muted"
                className="mx-auto mb-2 mt-1 w-full max-w-[640px]"
              >
                {row.label}
              </Text>
            ) : (
              <NotificationReviewCard
                key={row.entry.id}
                entry={row.entry}
                selection={selections[row.entry.id]}
                busy={busy}
                money={money}
                onSelect={(selection) =>
                  setSelections((current) => ({ ...current, [row.entry.id]: selection }))
                }
                onEdit={() => {
                  const entry = row.entry;
                  const selected = selections[entry.id];
                  const amount = selected
                    ? selected.amount
                    : (entry.selectedAmount ??
                      (entry.amounts?.length === 1 ? entry.amounts[0] : null));
                  // Auto-review's suggestion, when it left one, opens on that type.
                  const aiType = entry.ai && !entry.ai.undone ? entry.ai.decision : null;
                  const type =
                    aiType === 'income' || aiType === 'expense'
                      ? aiType
                      : app.categories.find((item) => item.id === entry.categoryId)?.type ===
                          'income'
                        ? 'income'
                        : 'expense';
                  navigation.navigate('NotificationReviewEditor', {
                    captureId: entry.id,
                    ...{
                      appUserId: identity.current.user,
                      generation: identity.current.generation,
                    },
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
                  void run([row.entry.id], action);
                }}
                canUndo={canUndo(row.entry)}
                onUndo={() => confirmUndo(row.entry)}
              />
            )
          }
        />
      )}
    </SettingsPageLayout>
  );
}

type ListRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'entry'; key: string; entry: NotificationScanHistoryEntry };

/** One "Today" / "Yesterday" / date label per day, so cards show only the time. */
function withDayLabels(
  entries: readonly NotificationScanHistoryEntry[],
  locale: string,
): ListRow[] {
  const rows: ListRow[] = [];
  let lastDay = '';
  for (const entry of entries) {
    const day = dayKeyFromIsoLocal(entry.capturedAt);
    if (day !== lastDay) {
      rows.push({
        kind: 'day',
        key: `day:${day}`,
        label: formatRelativeDate(entry.capturedAt, locale),
      });
      lastDay = day;
    }
    rows.push({ kind: 'entry', key: entry.id, entry });
  }
  return rows;
}

function timeOf(iso: string): string {
  const date = new Date(iso);
  return formatTimeOfDay(date.getHours(), date.getMinutes());
}

const CHOICES = [
  {
    action: 'income',
    key: 'nav.income',
    all: 'payment_alerts.review_income_all',
    suggest: 'border-transparent bg-success/15',
    text: 'text-success',
  },
  {
    action: 'expense',
    key: 'nav.expense',
    all: 'payment_alerts.review_expense_all',
    suggest: 'border-transparent bg-destructive/10',
    text: 'text-destructive',
  },
  {
    action: 'none',
    key: 'payment_alerts.review_ignore',
    all: 'payment_alerts.review_ignore_all',
    suggest: '',
    text: '',
  },
] as const;

/**
 * Income / Expense / Ignore as small outlined capsules. AI's guess, when it
 * left the decision to the user, is the softly filled one.
 */
function ReviewChoices({
  disabled,
  incomeExpenseDisabled = false,
  suggested = null,
  all = false,
  onAction,
}: {
  disabled: boolean;
  incomeExpenseDisabled?: boolean;
  suggested?: 'income' | 'expense' | null;
  all?: boolean;
  onAction: (action: 'income' | 'expense' | 'none') => void;
}) {
  return (
    <View className={`flex-row gap-2 ${all ? 'w-full' : ''}`}>
      {CHOICES.map((choice) => {
        const off = disabled || (choice.action !== 'none' && incomeExpenseDisabled);
        const isSuggested = suggested === choice.action;
        return (
          <Pressable
            key={choice.action}
            accessibilityRole="button"
            accessibilityState={{ disabled: off }}
            accessibilityHint={
              isSuggested ? I18n.t(`payment_alerts.ai_hint_${choice.action}`) : undefined
            }
            disabled={off}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              void triggerHaptic('selection');
              onAction(choice.action);
            }}
            className={`h-9 items-center justify-center rounded-full border px-3.5 ${
              all ? 'h-11 flex-1' : ''
            } ${isSuggested ? choice.suggest : 'border-border bg-card'} ${off ? 'opacity-40' : ''}`}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              className={`text-[13px] font-semibold ${isSuggested ? choice.text : 'text-foreground'}`}
            >
              {I18n.t(all ? choice.all : choice.key)}
            </Text>
          </Pressable>
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
  const { accounts } = useApp();
  const colors = useThemeColors();
  const initialAmount =
    entry.selectedAmount ?? (entry.amounts?.length === 1 ? entry.amounts[0] : null);
  const selected = selection ?? { amount: initialAmount, accountId: entry.accountId ?? null };
  const [expanded, setExpanded] = useState(false);
  const pending = entry.result === 'pending';
  const account = accounts.find((item) => item.id === selected.accountId && isPayableAccount(item));
  const logged = entry.result === 'expense' || entry.result === 'income';
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
  // AI's guess on one it left for the user: shown by the filled choice.
  const decision = entry.ai && !entry.ai.undone ? entry.ai.decision : null;
  const suggested = decision === 'income' || decision === 'expense' ? decision : null;
  return (
    <View className="mx-auto mb-2.5 w-full max-w-[640px] gap-1 rounded-2xl bg-card px-4 py-3">
      <View className="flex-row items-center gap-3">
        <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
          {entry.sourceLabel ?? I18n.t('payment_alerts.ios_notifications_title')}
        </Text>
        {pending ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.edit')}
            disabled={busy}
            hitSlop={8}
            onPress={onEdit}
            className="max-w-[55%] flex-row items-center gap-1.5"
          >
            {selected.amount ? (
              <Text variant="bodyStrong" numberOfLines={1} className="shrink text-[17px]">
                {money(selected.amount.amount, selected.amount.currency)}
              </Text>
            ) : null}
            <Pencil size={13} color={colors.textMuted} />
          </Pressable>
        ) : logged && selected.amount ? (
          // An ignored notification moved no money; its figures may be a code or balance.
          <Text
            variant="bodyStrong"
            tone={tone}
            numberOfLines={1}
            className="max-w-[55%] text-[17px]"
          >
            {money(selected.amount.amount, selected.amount.currency)}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={I18n.t(
          expanded ? 'payment_alerts.review_show_less' : 'payment_alerts.review_show_more',
        )}
        onPress={() => setExpanded((value) => !value)}
      >
        <Text
          variant="body"
          tone="muted"
          numberOfLines={expanded ? undefined : 2}
          className="text-[14px]"
        >
          {entry.text}
        </Text>
      </Pressable>
      {pending && (entry.amounts?.length ?? 0) > 1 ? (
        <View className="flex-row flex-wrap gap-2 pt-1">
          {entry.amounts?.map((candidate) => (
            <Pressable
              key={`${candidate.currency}:${candidate.amount}`}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onSelect({ ...selected, amount: candidate })}
              className={`h-9 justify-center rounded-full border px-3 ${
                selected.amount?.currency === candidate.currency &&
                selected.amount.amount === candidate.amount
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border'
              }`}
            >
              <Text variant="caption">{money(candidate.amount, candidate.currency)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {pending && !account ? (
        // The fix belongs in setup, so every later notification gets an account.
        <View
          className="mt-1 flex-row items-start gap-2 rounded-xl bg-warning/10 px-3 py-2"
          testID="notification-no-account"
        >
          <AlertTriangle size={14} color={colors.error} style={{ marginTop: 1 }} />
          <Text variant="caption" tone="warning" className="flex-1">
            {I18n.t(
              entry.channel === 'android_notification'
                ? 'payment_alerts.review_no_account_android'
                : 'payment_alerts.review_no_account_ios',
            )}
          </Text>
        </View>
      ) : null}
      <View className="mt-1.5 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <Text variant="caption" tone="muted">
          {timeOf(entry.capturedAt)}
        </Text>
        {pending ? (
          <ReviewChoices
            disabled={busy}
            incomeExpenseDisabled={!selected.amount || !account}
            suggested={suggested}
            onAction={onAction}
          />
        ) : (
          <View className="flex-row items-center gap-2.5">
            <Text variant="caption" tone={tone}>
              {label}
            </Text>
            {canUndo ? <UndoButton disabled={busy} onPress={onUndo} /> : null}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * What auto-review just logged or ignored, until the user leaves the page: one
 * card, folded to "Sorted for you · 1 logged · 1 ignored", that opens into
 * transaction rows, each with Undo.
 */
function SortedGroup({
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
  const [open, setOpen] = useState(false);
  const logged = entries.filter((entry) => entry.result !== 'none').length;
  const ignored = entries.length - logged;
  const Chevron = open ? ChevronUp : ChevronDown;
  const summary = [
    logged > 0 ? I18n.t('payment_alerts.ai_logged_count', { count: logged }) : null,
    ignored > 0 ? I18n.t('payment_alerts.ai_ignored_count', { count: ignored }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View className="mx-auto mb-3 w-full max-w-[640px] overflow-hidden rounded-2xl bg-card">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${I18n.t('payment_alerts.ai_done_title')}, ${summary}`}
        testID="notification-ai-done-toggle"
        onPress={() => {
          void triggerHaptic('selection');
          setOpen((value) => !value);
        }}
        className="min-h-14 flex-row items-center gap-3 px-4 py-3"
      >
        <ClayIcon name="status/sorted" size={36} flatSize={22} />
        <View className="flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {I18n.t('payment_alerts.ai_done_title')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Chevron size={18} color={colors.textMuted} />
      </Pressable>
      {open
        ? entries.map((entry, index) => (
            <SortedRow
              key={entry.id}
              index={index}
              entry={entry}
              busy={busy}
              money={money}
              canUndo={canUndo(entry)}
              onUndo={() => onUndo(entry)}
            />
          ))
        : null}
    </View>
  );
}

/** Undo as a small round icon button; the label is for screen readers. */
function UndoButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={I18n.t('payment_alerts.ai_undo')}
      accessibilityState={{ disabled }}
      testID="notification-undo"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      className={`h-8 w-8 items-center justify-center rounded-full bg-secondary ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <Undo2 size={15} strokeWidth={2.25} color={colors.primary} />
    </Pressable>
  );
}

/** A logged result reads like its transaction row; an ignored one says why. */
function SortedRow({
  index,
  entry,
  busy,
  money,
  canUndo,
  onUndo,
}: {
  index: number;
  entry: NotificationScanHistoryEntry;
  busy: boolean;
  money: (amount: number, currency: string) => string;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { accounts, categories } = useApp();
  const [expanded, setExpanded] = useState(false);
  const source = entry.sourceLabel ?? I18n.t('payment_alerts.ios_notifications_title');
  const ignored = entry.result === 'none';
  const transaction =
    !ignored && entry.transactionId ? transactionsRepository.getById(entry.transactionId) : null;
  const category = categories.find((item) => item.id === transaction?.categoryId);
  const account = accounts.find((item) => item.id === (transaction?.accountId ?? entry.accountId));
  const title = ignored ? source : transaction?.note?.trim() || source;
  const reason = entry.ai?.reason;
  const subtitle = ignored
    ? reason
      ? `${I18n.t('payment_alerts.history_none')} · ${I18n.t(`payment_alerts.ai_reason_${reason}`)}`
      : I18n.t('payment_alerts.history_none')
    : [category?.name, account?.name].filter(Boolean).join(' · ');
  return (
    <View testID={`notification-ai-done-${index}`} className="border-t border-border/40">
      <View className="flex-row items-center gap-3 px-4 py-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${subtitle}`}
          accessibilityHint={I18n.t(
            expanded ? 'payment_alerts.review_show_less' : 'payment_alerts.review_show_more',
          )}
          onPress={() => setExpanded((value) => !value)}
          className="flex-1 flex-row items-center gap-3"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary">
            {ignored ? (
              <ClayIcon name="status/ignored" size={24} flatSize={17} />
            ) : (
              <CategoryEmoji icon={category?.icon} size={22} />
            )}
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <View className="flex-row items-center gap-2.5">
          {!ignored && entry.selectedAmount ? (
            <Text
              variant="bodyStrong"
              tone={entry.result === 'income' ? 'success' : 'error'}
              numberOfLines={1}
            >
              {money(entry.selectedAmount.amount, entry.selectedAmount.currency)}
            </Text>
          ) : null}
          {canUndo ? <UndoButton disabled={busy} onPress={onUndo} /> : null}
        </View>
      </View>
      {expanded ? (
        <Text variant="caption" tone="muted" className="px-4 pb-3">
          {entry.text}
        </Text>
      ) : null}
    </View>
  );
}
