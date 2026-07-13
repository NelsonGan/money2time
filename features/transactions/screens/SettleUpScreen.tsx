import { ChevronRight, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { CategoryEmoji, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  useSettleUpByTransaction,
  useSettleUpSummary,
} from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { PersonDebt } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatRelativeDate } from '~/utils/formatters';

type SettleUpTab = 'people' | 'transactions';

const TAB_ORDER: SettleUpTab[] = ['people', 'transactions'];

interface SettleUpScreenProps {
  onBack: () => void;
  onOpenPerson: (personKey: string) => void;
  onOpenTransaction: (transactionId: string) => void;
  onOpenSettings: () => void;
}

const AVATAR_COLORS = [
  '#C2604A',
  '#4A78C2',
  '#8A5AC2',
  '#3E9A78',
  '#C28A3E',
  '#B94A78',
  '#4AA5C2',
  '#7A7A3E',
];

function avatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function personInitial(person: PersonDebt): string {
  const name = person.name?.trim();
  return name ? name[0]!.toUpperCase() : '?';
}

export function SettleUpScreen({
  onBack,
  onOpenPerson,
  onOpenTransaction,
  onOpenSettings,
}: SettleUpScreenProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings } = useApp();

  const [tab, setTab] = useState<SettleUpTab>('people');
  const summary = useSettleUpSummary();
  const byTransaction = useSettleUpByTransaction();

  // Horizontal pager keeps the two tabs swipeable; state and page index stay in sync.
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

  // Keep the pager aligned when the tab changes from a tab tap.
  useEffect(() => {
    if (activeTabIndex === pagerPositionRef.current) return;
    pagerPositionRef.current = activeTabIndex;
    pagerRef.current?.setPage(activeTabIndex);
  }, [activeTabIndex]);

  const formatReporting = useCallback(
    (value: number) => formatCurrency(value, settings.currencySymbol),
    [settings.currencySymbol],
  );
  const formatNative = useCallback(
    (value: number, currency: string) => formatCurrency(value, currencySymbolForCode(currency)),
    [],
  );

  useEffect(() => {
    trackEvent(AnalyticsEvents.SETTLE_UP_OPENED);
  }, []);

  const hasDebts = summary.personCount > 0;

  const tabs: { value: SettleUpTab; label: string }[] = [
    { value: 'people', label: I18n.t('transactions.settleUp.tab_by_person') },
    { value: 'transactions', label: I18n.t('transactions.settleUp.tab_by_transaction') },
  ];

  const scrollContentStyle = {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: insets.bottom + 24,
  };

  // Outstanding hero — a clean centered total (matching the split subtotal /
  // insights breakdown hero): plain label + big amount + accent underline.
  const renderHero = () => (
    <View className="items-center px-4 pt-4 pb-2">
      <Text variant="caption" tone="muted">
        {I18n.t('transactions.settleUp.outstanding_label')}
      </Text>
      <Text variant="title" className="mt-1 text-center">
        {formatReporting(summary.totalReporting)}
      </Text>
      <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
    </View>
  );

  const renderPeopleList = () => (
    <View className="mt-5 gap-2">
      {summary.people.map((person) => (
        <Pressable
          key={person.key}
          onPress={() => {
            void triggerHaptic('selection');
            onOpenPerson(person.key);
          }}
          className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-card px-3.5 py-3 active:opacity-80"
        >
          <View
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: avatarColor(person.key) }}
          >
            <Text variant="bodyStrong" style={{ color: '#fff' }}>
              {personInitial(person)}
            </Text>
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {person.name ?? I18n.t('transactions.settleUp.someone')}
            </Text>
            <Text variant="caption" tone="muted">
              {person.billCount === 1
                ? I18n.t('transactions.settleUp.bills_one')
                : I18n.t('transactions.settleUp.bills_other', { count: person.billCount })}
              {' · '}
              {formatRelativeDate(person.oldestDate)}
            </Text>
          </View>
          <View className="items-end">
            <Text variant="bodyStrong" className="text-warning">
              {formatReporting(person.totalReporting)}
            </Text>
          </View>
          <ChevronRight size={18} color={themeColors.textMuted} />
        </Pressable>
      ))}
    </View>
  );

  const renderTransactionsList = () => (
    <View className="mt-5 gap-2">
      {byTransaction.transactions.map((bill) => (
        <Pressable
          key={bill.transactionId}
          onPress={() => {
            void triggerHaptic('selection');
            onOpenTransaction(bill.transactionId);
          }}
          className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-card px-3.5 py-3 active:opacity-80"
        >
          <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary/50">
            <CategoryEmoji icon={bill.categoryIcon} size={22} className="text-[19px]" />
          </View>
          <View className="flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {bill.note?.trim() ||
                bill.categoryName ||
                I18n.t('transactions.settleUp.untitled_bill')}
            </Text>
            <Text variant="caption" tone="muted">
              {bill.splitCount === 1
                ? I18n.t('transactions.settleUp.people_one')
                : I18n.t('transactions.settleUp.people_other', { count: bill.splitCount })}
              {' · '}
              {formatRelativeDate(bill.date)}
            </Text>
          </View>
          <View className="items-end">
            <Text variant="bodyStrong" className="text-warning">
              {formatNative(bill.totalNative, bill.currency)}
            </Text>
          </View>
          <ChevronRight size={18} color={themeColors.textMuted} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('transactions.settleUp.title')}
        infoTooltip={I18n.t('transactions.settleUp.subtitle')}
        rightAccessory={
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onOpenSettings();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('transactions.settleUp.settings_action')}
            className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
          >
            <Settings2 size={18} color={themeColors.textMuted} />
          </Pressable>
        }
      />

      {/* Underline tabs: split the roll-up by person or by transaction */}
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

      {!hasDebts ? (
        <ScrollView className="flex-1" contentContainerStyle={scrollContentStyle}>
          <View className="mt-6">
            <EmptyState
              title={I18n.t('transactions.settleUp.empty_title')}
              message={I18n.t('transactions.settleUp.empty_subtitle')}
              mascotMood="happy"
            />
          </View>
        </ScrollView>
      ) : (
        <PagerView
          ref={pagerRef}
          style={{ flex: 1 }}
          initialPage={activeTabIndex}
          onPageSelected={handlePageSelected}
        >
          {TAB_ORDER.map((value) => (
            <View key={value} style={{ flex: 1 }}>
              <ScrollView className="flex-1" contentContainerStyle={scrollContentStyle}>
                {renderHero()}
                {value === 'people' ? renderPeopleList() : renderTransactionsList()}
              </ScrollView>
            </View>
          ))}
        </PagerView>
      )}
    </SettingsPageLayout>
  );
}
