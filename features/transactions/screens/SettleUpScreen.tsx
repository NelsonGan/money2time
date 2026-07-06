import * as ImagePicker from 'expo-image-picker';
import { Check, ChevronRight, Clock3, ImagePlus, QrCode, Send } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Share, TextInput, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  SettingsHeader,
  SettingsPageLayout,
  Text,
  ThemeModal,
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
import { convert, currencySymbolForCode } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  formatCurrency,
  formatHours,
  formatRelativeDate,
} from '~/utils/formatters';
import {
  aggregateUnpaidSplitsByPerson,
  buildReceiptText,
} from '~/features/transactions/lib/settleUp';

interface SettleUpScreenProps {
  onBack: () => void;
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

export function SettleUpScreen({ onBack }: SettleUpScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const { settings, rateTable, getTrueHourlyRateForDate, markSplitPaid, updateSettings } = useApp();
  const { transactions } = useTransactions();

  const reportingCurrency = settings.currencyCode;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rateToReporting = useCallback(
    (currency: string) => convert(1, currency, reportingCurrency, rateTable).rateUsed,
    [rateTable, reportingCurrency],
  );

  const summary = useMemo(
    () => aggregateUnpaidSplitsByPerson(transactions, { reportingCurrency, rateToReporting }),
    [transactions, reportingCurrency, rateToReporting],
  );

  const selectedPerson = useMemo(
    () => summary.people.find((p) => p.key === selectedKey) ?? null,
    [summary.people, selectedKey],
  );

  const hourlyRate = getTrueHourlyRateForDate(dayKeyFromDateLocal(new Date()));
  const totalHours = hourlyRate > 0 ? amountToHoursByRate(summary.totalReporting, hourlyRate) : 0;

  const qrUri = getPaymentQrUri(settings.paymentQrUri);
  const [qrLabelDraft, setQrLabelDraft] = useState(settings.paymentQrLabel ?? '');

  const formatReporting = useCallback(
    (value: number) => formatCurrency(value, settings.currencySymbol),
    [settings.currencySymbol],
  );
  const formatNative = useCallback(
    (amount: number, currency: string) => formatCurrency(amount, currencySymbolForCode(currency)),
    [],
  );

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

  const handleShare = useCallback(
    async (person: PersonDebt) => {
      void triggerHaptic('selection');
      const fromName = settings.profileName?.trim() || null;
      const toName = person.name ?? I18n.t('transactions.settleUp.someone');
      const fromTo = fromName ? `${fromName} → ${toName}` : `${toName}`;
      const label = settings.paymentQrLabel?.trim();
      const resolvedQr = getPaymentQrUri(settings.paymentQrUri);
      const text = buildReceiptText(person, {
        strings: {
          heading: I18n.t('transactions.settleUp.receipt_heading'),
          fromTo,
          totalLabel: I18n.t('transactions.settleUp.receipt_total_label'),
          payLine: label ? I18n.t('transactions.settleUp.receipt_pay_line', { label }) : null,
          qrNote: resolvedQr ? I18n.t('transactions.settleUp.receipt_qr_note') : null,
          footer: I18n.t('transactions.settleUp.receipt_footer'),
        },
        formatMoney: formatNative,
      });
      try {
        // On iOS `url` attaches the QR image alongside the text; Android shares
        // the text (the receipt is self-contained without the image).
        await Share.share(resolvedQr ? { message: text, url: resolvedQr } : { message: text });
        trackEvent(AnalyticsEvents.SETTLE_UP_RECEIPT_SHARED, {
          billCount: person.billCount,
          hasQr: !!resolvedQr,
        });
      } catch {
        // User cancelled the share sheet — no-op.
      }
    },
    [formatNative, settings.paymentQrLabel, settings.paymentQrUri, settings.profileName],
  );

  const handleMarkPaid = useCallback(
    (splitId: string) => {
      void triggerHaptic('success');
      markSplitPaid(splitId);
    },
    [markSplitPaid],
  );

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
        {/* Outstanding hero */}
        <View className="rounded-[24px] border border-warning/25 bg-warning/10 px-5 py-5">
          <Text variant="caption" tone="muted" className="uppercase tracking-wide">
            {I18n.t('transactions.settleUp.outstanding_label')}
          </Text>
          <Text variant="heading" className="mt-1 text-3xl">
            {formatReporting(summary.totalReporting)}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Text variant="caption" tone="muted">
              {summary.personCount === 1
                ? I18n.t('transactions.settleUp.people_one')
                : I18n.t('transactions.settleUp.people_other', { count: summary.personCount })}
            </Text>
            {totalHours > 0 ? (
              <View className="flex-row items-center gap-1">
                <Clock3 size={12} color={themeColors.textMuted} />
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.settleUp.time_equiv', { time: formatHours(totalHours) })}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Payment QR card */}
        <View className="mt-4 rounded-[24px] border border-border/25 bg-card/60 px-4 py-4">
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
                style={{ width: 64, height: 64, borderRadius: 12 }}
                resizeMode="cover"
              />
              <View className="flex-1">
                <TextInput
                  value={qrLabelDraft}
                  onChangeText={setQrLabelDraft}
                  onEndEditing={handleCommitLabel}
                  onBlur={handleCommitLabel}
                  placeholder={I18n.t('transactions.settleUp.qr_label_placeholder')}
                  placeholderTextColor={`${themeColors.mutedForeground}99`}
                  style={[SINGLE_LINE_TEXT_INPUT_STYLE, { color: themeColors.text, fontSize: 14 }]}
                />
                <View className="mt-1 flex-row gap-3">
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
                  setSelectedKey(person.key);
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
      </ScrollView>

      <PersonDebtSheet
        person={selectedPerson}
        onClose={() => setSelectedKey(null)}
        onShare={handleShare}
        onMarkPaid={handleMarkPaid}
        formatReporting={formatReporting}
        formatNative={formatNative}
      />
    </SettingsPageLayout>
  );
}

interface PersonDebtSheetProps {
  person: PersonDebt | null;
  onClose: () => void;
  onShare: (person: PersonDebt) => void;
  onMarkPaid: (splitId: string) => void;
  formatReporting: (value: number) => string;
  formatNative: (amount: number, currency: string) => string;
}

function PersonDebtSheet({
  person,
  onClose,
  onShare,
  onMarkPaid,
  formatReporting,
  formatNative,
}: PersonDebtSheetProps) {
  const themeColors = useThemeColors();

  return (
    <ThemeModal
      visible={person !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SettingsPageLayout>
        <SettingsHeader
          className="px-5 pt-5 pb-3"
          onBack={onClose}
          title={person?.name ?? I18n.t('transactions.settleUp.someone')}
        />
        {person ? (
          <>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
            >
              <View className="rounded-[24px] border border-warning/25 bg-warning/10 px-5 py-4">
                <Text variant="caption" tone="muted" className="uppercase tracking-wide">
                  {I18n.t('transactions.settleUp.person_owes_label')}
                </Text>
                <Text variant="heading" className="mt-1 text-3xl">
                  {formatReporting(person.totalReporting)}
                </Text>
              </View>

              <View className="mt-4 gap-2">
                {person.bills.map((bill) => (
                  <View
                    key={bill.splitId}
                    className="flex-row items-center gap-3 rounded-2xl border border-border/25 bg-card/60 px-3.5 py-3"
                  >
                    <View className="flex-1">
                      <Text variant="body" numberOfLines={1}>
                        {bill.note?.trim() ||
                          bill.categoryName ||
                          I18n.t('transactions.settleUp.untitled_bill')}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {formatRelativeDate(bill.date)}
                      </Text>
                    </View>
                    <Text variant="bodyStrong">{formatNative(bill.amount, bill.currency)}</Text>
                    <Pressable
                      onPress={() => onMarkPaid(bill.splitId)}
                      hitSlop={6}
                      className="flex-row items-center gap-1 rounded-full bg-success/15 px-3 py-1.5 active:opacity-70"
                    >
                      <Check size={13} color={themeColors.success} />
                      <Text variant="caption" className="text-success font-medium">
                        {I18n.t('transactions.editor.split.mark_paid')}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View className="px-5 pb-8 pt-2">
              <Pressable
                onPress={() => onShare(person)}
                className="flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-4 active:opacity-90"
              >
                <Send size={18} color="#fff" />
                <Text variant="bodyStrong" className="text-primary-foreground">
                  {I18n.t('transactions.settleUp.share_receipt')}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </SettingsPageLayout>
    </ThemeModal>
  );
}
