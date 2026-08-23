import { ArrowRight, ArrowRightLeft, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';

import { Text, ThemeModal } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { convert, currencySymbolForCode, resolveRate } from '~/utils/currency';
import type { RateTable } from '~/types';

interface TransferFxModalProps {
  visible: boolean;
  fromCurrency: string;
  toCurrency: string;
  /** Sent amount in the from-currency. */
  fromAmount: number;
  rateTable: RateTable;
  /** Current received amount (to-currency); empty string means "auto". */
  toAmount: string;
  /** Exact current rate when the caller already has a frozen conversion snapshot. */
  initialRate?: number | null;
  /** Optional copy overrides let other transaction conversions reuse this UI. */
  title?: string;
  targetAmountLabel?: string;
  onClose: () => void;
  onApply: (toAmount: string, rate?: number) => void;
}

/** Trim trailing zeros from a computed value so inputs stay readable. */
function fmt(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n * 1e6) / 1e6);
}

export function TransferFxModal({
  visible,
  fromCurrency,
  toCurrency,
  fromAmount,
  rateTable,
  toAmount,
  initialRate,
  title,
  targetAmountLabel,
  onClose,
  onApply,
}: TransferFxModalProps) {
  const themeColors = useThemeColors();
  const [rateStr, setRateStr] = useState('');
  const [receivedStr, setReceivedStr] = useState('');

  // Seed the fields whenever the sheet opens from the current received amount
  // (or the latest cached rate when the user hasn't overridden it).
  useEffect(() => {
    if (!visible) return;
    const fallbackRate = resolveRate(fromCurrency, toCurrency, rateTable) ?? 0;
    const received = toAmount.trim()
      ? Number(toAmount)
      : convert(fromAmount, fromCurrency, toCurrency, rateTable).value;
    const effectiveRate =
      initialRate != null && Number.isFinite(initialRate) && initialRate > 0
        ? initialRate
        : fromAmount > 0 && Number.isFinite(received) && received > 0
          ? received / fromAmount
          : fallbackRate;
    setRateStr(fmt(effectiveRate));
    setReceivedStr(toAmount.trim() ? toAmount : fmt(received));
  }, [visible, fromCurrency, toCurrency, fromAmount, rateTable, toAmount, initialRate]);

  const handleRateChange = (text: string) => {
    setRateStr(text);
    const r = Number(text.replace(',', '.'));
    if (Number.isFinite(r) && r > 0 && fromAmount > 0) setReceivedStr(fmt(r * fromAmount));
  };

  const handleReceivedChange = (text: string) => {
    setReceivedStr(text);
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && v > 0 && fromAmount > 0) setRateStr(fmt(v / fromAmount));
  };

  const handleDone = () => {
    const rate = Number(rateStr.replace(',', '.'));
    const received = Number(receivedStr.replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(received) || received <= 0) return;
    void triggerHaptic('selection');
    Keyboard.dismiss();
    onApply(receivedStr.trim(), rate);
    onClose();
  };

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const valid =
    Number.isFinite(Number(rateStr.replace(',', '.'))) &&
    Number(rateStr.replace(',', '.')) > 0 &&
    Number.isFinite(Number(receivedStr.replace(',', '.'))) &&
    Number(receivedStr.replace(',', '.')) > 0;
  const rateLabel = I18n.t('transactions.editor.fx_rate');
  const amountLabel = targetAmountLabel ?? I18n.t('transactions.editor.fx_received');

  const rateFieldStyle = {
    flex: 1,
    minWidth: 104,
    color: themeColors.text,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 4,
    textAlign: 'right' as const,
    fontSize: 16,
    fontWeight: '600' as const,
  };
  const amountFieldStyle = {
    flex: 1,
    minHeight: 44,
    color: themeColors.text,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: 'right' as const,
    fontSize: 30,
    fontWeight: '700' as const,
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/45 px-5"
        onPress={handleClose}
      >
        <Pressable
          className="w-full max-w-[360px] overflow-hidden rounded-[30px] border border-border/30 bg-background shadow-float"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="flex-row items-center gap-3 px-5 pb-4 pt-5">
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
            >
              <X size={17} color={themeColors.textMuted} />
            </Pressable>
            <View className="min-w-0 flex-1">
              <Text variant="subheading" numberOfLines={1}>
                {title ?? I18n.t('transactions.editor.fx_title')}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <Text variant="caption" tone="muted">
                  {fromCurrency}
                </Text>
                <ArrowRightLeft size={12} color={themeColors.textMuted} strokeWidth={2.2} />
                <Text variant="caption" tone="muted">
                  {toCurrency}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={handleDone}
              disabled={!valid}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid }}
              className="h-9 items-center justify-center rounded-pill bg-primary px-4 shadow-glow active:opacity-90 disabled:opacity-40"
            >
              <Text variant="caption" tone="inverse">
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>

          <View className="px-5 pb-5">
            <View className="rounded-[22px] border border-primary/20 bg-primary/10 px-4 pb-3 pt-3.5">
              <View className="flex-row items-center justify-between gap-3">
                <Text variant="caption" tone="muted">
                  {amountLabel}
                </Text>
                <View className="rounded-full bg-background/80 px-2.5 py-1">
                  <Text variant="caption" style={{ color: themeColors.primary }}>
                    {toCurrency}
                  </Text>
                </View>
              </View>
              <View className="mt-1 flex-row items-center gap-3">
                <Text style={{ color: themeColors.primary, fontSize: 24, fontWeight: '600' }}>
                  {currencySymbolForCode(toCurrency)}
                </Text>
                <TextInput
                  value={receivedStr}
                  onChangeText={handleReceivedChange}
                  keyboardType="decimal-pad"
                  accessibilityLabel={amountLabel}
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                  allowFontScaling={false}
                  selectTextOnFocus
                  selectionColor={themeColors.primary}
                  style={amountFieldStyle}
                />
              </View>
            </View>

            <View className="mt-3 rounded-[18px] border border-border/30 bg-card px-4 py-3.5">
              <Text variant="caption" tone="muted">
                {rateLabel}
              </Text>
              <View className="mt-2 flex-row items-center gap-2">
                <Text variant="caption" tone="muted">
                  1 {fromCurrency}
                </Text>
                <ArrowRight size={14} color={themeColors.textMuted} />
                <TextInput
                  value={rateStr}
                  onChangeText={handleRateChange}
                  keyboardType="decimal-pad"
                  accessibilityLabel={rateLabel}
                  placeholder="0"
                  placeholderTextColor={themeColors.textMuted}
                  allowFontScaling={false}
                  selectTextOnFocus
                  selectionColor={themeColors.primary}
                  style={rateFieldStyle}
                />
                <Text variant="caption" tone="muted">
                  {toCurrency}
                </Text>
              </View>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
