import { CalendarDays, Check, ChevronDown, RotateCcw, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerModal } from '~/components/datePicker/DatePickerModal';
import { EmptyState } from '~/components/feedback/EmptyState';
import {
  AccountLogo,
  AccountPickerSheet,
  CategoryEmoji,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  usePendingReimbursements,
  useReimbursedClaims,
} from '~/features/transactions/lib/useReimbursements';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { PayerClaims, ReimbursementClaim } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import {
  dayKeyFromDateLocal,
  formatCurrency,
  formatRelativeDate,
  formatShortDate,
} from '~/utils/formatters';

type ReimbursementsTab = 'pending' | 'reimbursed';

const TAB_ORDER: ReimbursementsTab[] = ['pending', 'reimbursed'];

interface ReimbursementsScreenProps {
  onBack: () => void;
  onOpenTransaction: (transactionId: string) => void;
}

/** Whole days a claim has been open, for the "open N days" caption. */
function daysOpen(claim: ReimbursementClaim, today: string): number {
  const from = Date.parse(claim.claimedAt ?? claim.date);
  const to = Date.parse(today);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

export function ReimbursementsScreen({ onBack, onOpenTransaction }: ReimbursementsScreenProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const {
    settings,
    accounts,
    accountGroups,
    getAccountById,
    markReimbursed,
    markReimbursedBulk,
    markUnreimbursed,
    removeReimbursementClaim,
  } = useApp();

  const [tab, setTab] = useState<ReimbursementsTab>('pending');
  const pending = usePendingReimbursements();
  const reimbursed = useReimbursedClaims();

  const today = useMemo(() => dayKeyFromDateLocal(new Date()), []);
  /** The date any clear on this visit is booked on. Defaults to today. */
  const [receivedOn, setReceivedOn] = useState(today);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  /**
   * Where the money is landing, per claim, chosen before clearing. Not
   * persisted: while a claim is pending there is no payout account yet, so an
   * unconfirmed choice has nowhere to live but this screen.
   */
  const [destinationByClaim, setDestinationByClaim] = useState<Record<string, string>>({});
  const [pickerForClaimId, setPickerForClaimId] = useState<string | null>(null);

  const pagerRef = useRef<PagerView>(null);
  const pagerPositionRef = useRef(0);
  const activeTabIndex = TAB_ORDER.indexOf(tab);

  const handlePageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const position = event.nativeEvent.position;
      pagerPositionRef.current = position;
      const nextTab = TAB_ORDER[position];
      if (nextTab && nextTab !== tab) {
        void triggerHaptic('selection');
        setTab(nextTab);
      }
    },
    [tab],
  );

  useEffect(() => {
    if (activeTabIndex === pagerPositionRef.current) return;
    pagerPositionRef.current = activeTabIndex;
    pagerRef.current?.setPage(activeTabIndex);
  }, [activeTabIndex]);

  useEffect(() => {
    trackEvent(AnalyticsEvents.REIMBURSEMENTS_OPENED);
  }, []);

  const formatReporting = useCallback(
    (value: number) => formatCurrency(value, settings.currencySymbol),
    [settings.currencySymbol],
  );
  const formatNative = useCallback(
    (amount: number, currency: string) => formatCurrency(amount, currencySymbolForCode(currency)),
    [],
  );

  const destinationFor = useCallback(
    (claim: ReimbursementClaim) => destinationByClaim[claim.transactionId] ?? claim.accountId,
    [destinationByClaim],
  );

  const handleMarkReimbursed = useCallback(
    (claim: ReimbursementClaim) => {
      void triggerHaptic('success');
      markReimbursed(claim.transactionId, {
        accountId: destinationFor(claim),
        date: receivedOn,
      });
    },
    [destinationFor, markReimbursed, receivedOn],
  );

  const handleReimburseWholePayer = useCallback(
    (payer: PayerClaims) => {
      void triggerHaptic('success');
      // Each claim keeps its own destination, so a payer whose claims were paid
      // from different cards still books each payout against the right account.
      const byDestination = new Map<string | null, string[]>();
      payer.claims.forEach((claim) => {
        const destination = destinationFor(claim);
        const bucket = byDestination.get(destination);
        if (bucket) bucket.push(claim.transactionId);
        else byDestination.set(destination, [claim.transactionId]);
      });
      byDestination.forEach((ids, accountId) => {
        markReimbursedBulk(ids, { accountId, date: receivedOn });
      });
    },
    [destinationFor, markReimbursedBulk, receivedOn],
  );

  const handleRemoveClaim = useCallback(
    (claim: ReimbursementClaim) => {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('transactions.reimbursements.remove_claim_title'),
        I18n.t('transactions.reimbursements.remove_claim_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.remove'),
            style: 'destructive',
            onPress: () => removeReimbursementClaim(claim.transactionId),
          },
        ],
      );
    },
    [removeReimbursementClaim],
  );

  const handleUndo = useCallback(
    (claim: ReimbursementClaim) => {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('transactions.reimbursements.undo_title'),
        I18n.t('transactions.reimbursements.undo_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('transactions.reimbursements.undo_action'),
            onPress: () => markUnreimbursed(claim.transactionId),
          },
        ],
      );
    },
    [markUnreimbursed],
  );

  const pickerClaim = useMemo(() => {
    if (!pickerForClaimId) return null;
    for (const payer of pending.payers) {
      const found = payer.claims.find((c) => c.transactionId === pickerForClaimId);
      if (found) return found;
    }
    return null;
  }, [pending.payers, pickerForClaimId]);

  const scrollContentStyle = {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: insets.bottom + 24,
  };

  const claimTitle = (claim: ReimbursementClaim) =>
    claim.note?.trim() ||
    claim.categoryName ||
    I18n.t('transactions.reimbursements.untitled_expense');

  const renderHero = (label: string, total: number) => (
    <View className="items-center px-4 pt-4 pb-2">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="title" className="mt-1 text-center">
        {formatReporting(total)}
      </Text>
      <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
    </View>
  );

  const renderPayerHeader = (payer: PayerClaims, action: React.ReactNode) => (
    <View className="mt-5 flex-row items-center gap-2 px-1">
      <View className="min-w-0 flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {payer.name ?? I18n.t('transactions.reimbursements.unassigned_payer')}
        </Text>
        <Text variant="caption" tone="muted">
          {payer.claimCount === 1
            ? I18n.t('transactions.reimbursements.claims_one')
            : I18n.t('transactions.reimbursements.claims_other', { count: payer.claimCount })}
          {' · '}
          {formatReporting(payer.totalReporting)}
        </Text>
      </View>
      {action}
    </View>
  );

  const renderPendingList = () => (
    <View className="gap-2">
      {pending.payers.map((payer) => (
        <View key={payer.key}>
          {renderPayerHeader(
            payer,
            <Pressable
              onPress={() => handleReimburseWholePayer(payer)}
              hitSlop={8}
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-full bg-success/15 px-3 py-1.5 active:opacity-70"
            >
              <Check size={13} color={themeColors.success} />
              <Text variant="caption" className="text-success font-medium">
                {I18n.t('transactions.reimbursements.mark_reimbursed')}
              </Text>
            </Pressable>,
          )}

          <View className="mt-2 gap-2">
            {payer.claims.map((claim) => {
              const destinationId = destinationFor(claim);
              const account = destinationId ? getAccountById(destinationId) : null;
              const isPartial = claim.amount < claim.grossAmount;
              const open = daysOpen(claim, today);
              return (
                <View
                  key={claim.transactionId}
                  className="rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5"
                >
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      onOpenTransaction(claim.transactionId);
                    }}
                    className="flex-row items-center gap-3 active:opacity-80"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
                      <CategoryEmoji icon={claim.categoryIcon} size={22} className="text-[19px]" />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {claimTitle(claim)}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {formatRelativeDate(claim.date)}
                        {' · '}
                        {open === 1
                          ? I18n.t('transactions.reimbursements.open_days_one')
                          : I18n.t('transactions.reimbursements.open_days_other', { count: open })}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text variant="bodyStrong" className="text-warning">
                        {formatNative(claim.amount, claim.currency)}
                      </Text>
                      {isPartial ? (
                        <Text variant="caption" tone="muted">
                          {I18n.t('transactions.reimbursements.partial_claim', {
                            amount: formatNative(claim.amount, claim.currency),
                            total: formatNative(claim.grossAmount, claim.currency),
                          })}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>

                  <View className="my-3 h-px bg-border/15" />

                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setPickerForClaimId(claim.transactionId);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('transactions.reimbursements.received_into_label')}
                      className="min-w-0 flex-shrink flex-row items-center gap-1.5 rounded-full bg-secondary/50 py-1.5 pl-2 pr-2.5 active:opacity-70"
                    >
                      {account ? (
                        <AccountLogo
                          logoId={account.logoId}
                          type={account.type}
                          goalEmoji={account.goalEmoji}
                          size={16}
                        />
                      ) : null}
                      <Text
                        variant="caption"
                        tone="muted"
                        numberOfLines={1}
                        className="max-w-[150px]"
                      >
                        {account?.name ?? I18n.t('common.no_account')}
                      </Text>
                      <ChevronDown size={12} color={themeColors.textMuted} />
                    </Pressable>
                    <View className="flex-1" />
                    <Pressable
                      onPress={() => handleRemoveClaim(claim)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('transactions.reimbursements.remove_claim')}
                      className="h-8 w-8 items-center justify-center rounded-full bg-destructive/10 active:opacity-70"
                    >
                      <Trash2 size={15} color={themeColors.error} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleMarkReimbursed(claim)}
                      hitSlop={8}
                      accessibilityRole="button"
                      className="flex-row items-center gap-1 rounded-full bg-success/15 px-3.5 py-2 active:opacity-70"
                    >
                      <Check size={14} color={themeColors.success} />
                      <Text variant="caption" className="text-success font-medium">
                        {I18n.t('transactions.reimbursements.mark_reimbursed')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );

  const renderReimbursedList = () => (
    <View className="gap-2">
      {reimbursed.payers.map((payer) => (
        <View key={payer.key}>
          {renderPayerHeader(payer, null)}
          <View className="mt-2 gap-2">
            {payer.claims.map((claim) => (
              <View
                key={claim.transactionId}
                className="flex-row items-center gap-3 rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5"
              >
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onOpenTransaction(claim.transactionId);
                  }}
                  className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
                    <CategoryEmoji icon={claim.categoryIcon} size={22} className="text-[19px]" />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {claimTitle(claim)}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {claim.reimbursedAt
                        ? I18n.t('transactions.reimbursements.reimbursed_on', {
                            date: formatShortDate(claim.reimbursedAt),
                          })
                        : formatRelativeDate(claim.date)}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" className="text-success">
                    {formatNative(claim.amount, claim.currency)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleUndo(claim)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.reimbursements.undo_action')}
                  className="h-8 w-8 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
                >
                  <RotateCcw size={15} color={themeColors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  const renderEmpty = (titleKey: string, messageKey: string) => (
    <View className="mt-8">
      <EmptyState title={I18n.t(titleKey)} message={I18n.t(messageKey)} mascotMood="happy" />
    </View>
  );

  const tabs: { value: ReimbursementsTab; label: string }[] = [
    { value: 'pending', label: I18n.t('transactions.reimbursements.tab_pending') },
    { value: 'reimbursed', label: I18n.t('transactions.reimbursements.tab_reimbursed') },
  ];

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('transactions.reimbursements.title')}
        infoTooltip={I18n.t('transactions.reimbursements.subtitle')}
        rightAccessory={
          // One received-on date for everything cleared on this visit, rather
          // than a per-row picker: filing a trip's receipts is one event.
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setDatePickerVisible(true);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('transactions.reimbursements.received_on_label')}
            className="h-9 flex-row items-center gap-1.5 rounded-full bg-secondary/60 px-3 active:opacity-70"
          >
            <CalendarDays size={15} color={themeColors.textMuted} />
            <Text variant="caption" tone="muted">
              {formatShortDate(receivedOn)}
            </Text>
          </Pressable>
        }
      />

      <View className="flex-row gap-6 border-b border-border/15 px-5">
        {tabs.map((t) => {
          const isActive = t.value === tab;
          return (
            <Pressable
              key={t.value}
              onPress={() => {
                if (isActive) return;
                void triggerHaptic('selection');
                setTab(t.value);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className="pb-2.5"
            >
              <Text
                variant="bodyStrong"
                className={cn(isActive ? 'text-foreground' : 'text-muted-foreground')}
              >
                {t.label}
              </Text>
              <View
                className="mt-2 h-0.5 rounded-full"
                style={{ backgroundColor: isActive ? themeColors.primary : 'transparent' }}
              />
            </Pressable>
          );
        })}
      </View>

      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={activeTabIndex}
        onPageSelected={handlePageSelected}
      >
        <View key="pending" style={{ flex: 1 }}>
          <ScrollView className="flex-1" contentContainerStyle={scrollContentStyle}>
            {pending.claimCount > 0 ? (
              <>
                {renderHero(
                  I18n.t('transactions.reimbursements.owed_label'),
                  pending.totalReporting,
                )}
                {renderPendingList()}
              </>
            ) : (
              renderEmpty(
                'transactions.reimbursements.empty_title',
                'transactions.reimbursements.empty_subtitle',
              )
            )}
          </ScrollView>
        </View>
        <View key="reimbursed" style={{ flex: 1 }}>
          <ScrollView className="flex-1" contentContainerStyle={scrollContentStyle}>
            {reimbursed.claimCount > 0 ? (
              <>
                {renderHero(
                  I18n.t('transactions.reimbursements.recovered_label'),
                  reimbursed.totalReporting,
                )}
                {renderReimbursedList()}
              </>
            ) : (
              renderEmpty(
                'transactions.reimbursements.empty_reimbursed_title',
                'transactions.reimbursements.empty_reimbursed_subtitle',
              )
            )}
          </ScrollView>
        </View>
      </PagerView>

      <AccountPickerSheet
        visible={pickerForClaimId !== null}
        onClose={() => setPickerForClaimId(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={pickerClaim ? destinationFor(pickerClaim) : null}
        onSelect={(accountId) => {
          if (pickerForClaimId && accountId) {
            setDestinationByClaim((prev) => ({ ...prev, [pickerForClaimId]: accountId }));
          }
          setPickerForClaimId(null);
        }}
      />

      <DatePickerModal
        visible={datePickerVisible}
        value={receivedOn}
        title={I18n.t('transactions.reimbursements.received_on_label')}
        onSelect={(date) => {
          setReceivedOn(date);
          setDatePickerVisible(false);
        }}
        onClose={() => setDatePickerVisible(false)}
      />
    </SettingsPageLayout>
  );
}
