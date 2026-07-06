import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, ImagePlus, QrCode } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, TextInput, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { useApp, useTransactions } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { deletePaymentQr, getPaymentQrUri, savePaymentQr } from '~/services/userAssets';
import type { PersonDebt } from '~/types';
import { convert } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';
import { formatCurrency, formatRelativeDate } from '~/utils/formatters';
import { aggregateUnpaidSplitsByPerson } from '~/features/transactions/lib/settleUp';

interface SettleUpScreenProps {
  onBack: () => void;
  onOpenPerson: (personKey: string) => void;
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

export function SettleUpScreen({ onBack, onOpenPerson }: SettleUpScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const { settings, rateTable, updateSettings } = useApp();
  const { transactions } = useTransactions();

  const reportingCurrency = settings.currencyCode;

  const rateToReporting = useCallback(
    (currency: string) => convert(1, currency, reportingCurrency, rateTable).rateUsed,
    [rateTable, reportingCurrency],
  );

  const summary = useMemo(
    () => aggregateUnpaidSplitsByPerson(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );

  const qrUri = useMemo(() => getPaymentQrUri(settings.paymentQrUri), [settings.paymentQrUri]);
  const [qrLabelDraft, setQrLabelDraft] = useState(settings.paymentQrLabel ?? '');

  const formatReporting = useCallback(
    (value: number) => formatCurrency(value, settings.currencySymbol),
    [settings.currencySymbol],
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
    updateSettings({ paymentQrUri: null, paymentQrLabel: null });
    setQrLabelDraft('');
    if (previous) deletePaymentQr(previous);
  }, [settings.paymentQrUri, updateSettings]);

  const handleCommitLabel = useCallback(() => {
    const next = qrLabelDraft.trim() || null;
    if (next !== (settings.paymentQrLabel ?? null)) {
      updateSettings({ paymentQrLabel: next });
    }
  }, [qrLabelDraft, settings.paymentQrLabel, updateSettings]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('transactions.settleUp.title')}
        infoTooltip={I18n.t('transactions.settleUp.subtitle')}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 4 }, bottomNavInset]}
      >
        {/* Outstanding hero, shown only when someone actually owes */}
        {summary.personCount > 0 ? (
          <View className="rounded-[24px] border border-warning/25 bg-warning/10 px-5 py-5">
            <Text variant="caption" tone="muted" className="uppercase tracking-wide">
              {I18n.t('transactions.settleUp.outstanding_label')}
            </Text>
            <Text variant="heading" className="mt-1 text-3xl">
              {formatReporting(summary.totalReporting)}
            </Text>
            <Text variant="caption" tone="muted" className="mt-1">
              {summary.personCount === 1
                ? I18n.t('transactions.settleUp.people_one')
                : I18n.t('transactions.settleUp.people_other', { count: summary.personCount })}
            </Text>
          </View>
        ) : null}

        {/* People list */}
        {summary.people.length === 0 ? (
          <View className="mt-6">
            <EmptyState
              title={I18n.t('transactions.settleUp.empty_title')}
              message={I18n.t('transactions.settleUp.empty_subtitle')}
              mascotMood="happy"
            />
          </View>
        ) : (
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
            <View className="mt-4 flex-row items-center gap-3">
              <Image
                source={{ uri: qrUri }}
                style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: '#fff' }}
                resizeMode="contain"
              />
              <View className="flex-1">
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.settleUp.qr_label_caption')}
                </Text>
                <View className="mt-0.5 rounded-lg border border-border/40 px-2.5 py-1.5">
                  <TextInput
                    value={qrLabelDraft}
                    onChangeText={setQrLabelDraft}
                    onEndEditing={handleCommitLabel}
                    onBlur={handleCommitLabel}
                    style={[
                      SINGLE_LINE_TEXT_INPUT_STYLE,
                      { color: themeColors.text, fontSize: 14 },
                    ]}
                  />
                </View>
                <View className="mt-1.5 flex-row gap-3">
                  <Pressable onPress={handlePickQr} hitSlop={6}>
                    <Text variant="caption" className="text-primary font-medium">
                      {I18n.t('transactions.settleUp.qr_replace')}
                    </Text>
                  </Pressable>
                  <Pressable onPress={handleRemoveQr} hitSlop={6}>
                    <Text variant="caption" className="text-destructive font-medium">
                      {I18n.t('common.remove')}
                    </Text>
                  </Pressable>
                </View>
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
