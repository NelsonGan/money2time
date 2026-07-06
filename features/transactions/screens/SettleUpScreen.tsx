import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, ImagePlus, QrCode } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { CategoryEmoji, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { deletePaymentQr, getPaymentQrUri, savePaymentQr } from '~/services/userAssets';
import type { PersonDebt } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';
import { formatCurrency, formatRelativeDate } from '~/utils/formatters';
import {
  useSettleUpByTransaction,
  useSettleUpSummary,
} from '~/features/transactions/lib/useSettleUpSummary';

type SettleUpTab = 'people' | 'transactions';

interface SettleUpScreenProps {
  onBack: () => void;
  onOpenPerson: (personKey: string) => void;
  onOpenTransaction: (transactionId: string) => void;
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

export function SettleUpScreen({ onBack, onOpenPerson, onOpenTransaction }: SettleUpScreenProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();

  const [tab, setTab] = useState<SettleUpTab>('people');
  const summary = useSettleUpSummary();
  const byTransaction = useSettleUpByTransaction();

  const qrUri = useMemo(() => getPaymentQrUri(settings.paymentQrUri), [settings.paymentQrUri]);

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

  const handlePickQr = useCallback(async () => {
    void triggerHaptic('selection');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        I18n.t('accounts.logo.permission_title'),
        I18n.t('accounts.logo.permission_message'),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const previous = settings.paymentQrUri;
      const relativePath = savePaymentQr(result.assets[0].uri);
      updateSettings({ paymentQrUri: relativePath });
      if (previous) deletePaymentQr(previous);
      trackEvent(AnalyticsEvents.SETTLE_UP_QR_SET);
    } catch (error) {
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [settings.paymentQrUri, updateSettings]);

  const handleRemoveQr = useCallback(() => {
    void triggerHaptic('warning');
    const previous = settings.paymentQrUri;
    updateSettings({ paymentQrUri: null });
    if (previous) deletePaymentQr(previous);
  }, [settings.paymentQrUri, updateSettings]);

  const hasDebts = summary.personCount > 0;

  const tabs: { value: SettleUpTab; label: string }[] = [
    { value: 'people', label: I18n.t('transactions.settleUp.tab_by_person') },
    { value: 'transactions', label: I18n.t('transactions.settleUp.tab_by_transaction') },
  ];

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('transactions.settleUp.title')}
        infoTooltip={I18n.t('transactions.settleUp.subtitle')}
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

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 4,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* Outstanding hero, shown only when someone actually owes */}
        {hasDebts ? (
          <View className="mt-4 rounded-[24px] border border-warning/25 bg-warning/10 px-5 py-5">
            <Text variant="caption" tone="muted" className="uppercase tracking-wide">
              {I18n.t('transactions.settleUp.outstanding_label')}
            </Text>
            <Text variant="heading" className="mt-1 text-3xl">
              {formatReporting(summary.totalReporting)}
            </Text>
            <Text variant="caption" tone="muted" className="mt-1">
              {tab === 'people'
                ? summary.personCount === 1
                  ? I18n.t('transactions.settleUp.people_one')
                  : I18n.t('transactions.settleUp.people_other', { count: summary.personCount })
                : byTransaction.transactionCount === 1
                  ? I18n.t('transactions.settleUp.transactions_one')
                  : I18n.t('transactions.settleUp.transactions_other', {
                      count: byTransaction.transactionCount,
                    })}
            </Text>
          </View>
        ) : null}

        {/* List: by person or by transaction */}
        {!hasDebts ? (
          <View className="mt-6">
            <EmptyState
              title={I18n.t('transactions.settleUp.empty_title')}
              message={I18n.t('transactions.settleUp.empty_subtitle')}
              mascotMood="happy"
            />
          </View>
        ) : tab === 'people' ? (
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
        ) : (
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
        )}

        {/* Payment QR card, attached once and shared onto every receipt */}
        <View className="mt-6 rounded-[24px] border border-border/25 bg-card/60 px-4 py-4">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <QrCode size={20} color={themeColors.primary} />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong">{I18n.t('transactions.settleUp.qr_card_title')}</Text>
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.settleUp.qr_card_subtitle')}
              </Text>
            </View>
          </View>

          {qrUri ? (
            <View className="mt-4 items-center">
              <Pressable onPress={handlePickQr} className="active:opacity-80">
                <Image
                  source={{ uri: qrUri }}
                  style={{ width: 220, height: 220, borderRadius: 18, backgroundColor: '#fff' }}
                  resizeMode="contain"
                />
              </Pressable>
              <View className="mt-3.5 flex-row items-center gap-8">
                <Pressable onPress={handlePickQr} hitSlop={8}>
                  <Text variant="body" className="text-primary font-medium">
                    {I18n.t('transactions.settleUp.qr_replace')}
                  </Text>
                </Pressable>
                <Pressable onPress={handleRemoveQr} hitSlop={8}>
                  <Text variant="body" className="text-destructive font-medium">
                    {I18n.t('common.remove')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={handlePickQr}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-primary/40 py-3.5 active:opacity-70"
            >
              <ImagePlus size={16} color={themeColors.primary} />
              <Text variant="body" className="text-primary font-medium">
                {I18n.t('transactions.settleUp.qr_add')}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}
