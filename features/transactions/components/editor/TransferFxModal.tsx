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
  onClose: () => void;
  onApply: (toAmount: string) => void;
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
      fromAmount > 0 && Number.isFinite(received) && received > 0
        ? received / fromAmount
        : fallbackRate;
    setRateStr(fmt(effectiveRate));
    setReceivedStr(toAmount.trim() ? toAmount : fmt(received));
  }, [visible, fromCurrency, toCurrency, fromAmount, rateTable, toAmount]);

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

  // Blur the search field before the native Modal tears down. Dismissing it
  // while a TextInput still has focus can leave a deferred blur event racing
  // the view teardown, crashing with EXC_BAD_ACCESS on iOS (Sentry
  // MONEY2TIME-6).
  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  const handleDone = () => {
    void triggerHaptic('selection');
    Keyboard.dismiss();
    onApply(receivedStr.trim());
    onClose();
  };

  const fieldStyle = {
    flex: 1,
    color: themeColors.text,
    borderColor: themeColors.border,
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'right' as const,
    fontSize: 16,
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={handleClose}>
        <Pressable
          className="w-full max-w-[340px] rounded-[28px] border border-border/30 bg-card p-5"
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="heading">{I18n.t('transactions.editor.fx_title')}</Text>

          <View className="mt-4 gap-1.5">
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.editor.fx_rate')}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text variant="caption" tone="muted">
                1 {fromCurrency} =
              </Text>
              <TextInput
                value={rateStr}
                onChangeText={handleRateChange}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={themeColors.textMuted}
                allowFontScaling={false}
                style={fieldStyle}
              />
              <Text variant="caption" tone="muted">
                {toCurrency}
              </Text>
            </View>
          </View>

          <View className="mt-4 gap-1.5">
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.editor.fx_received')}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text variant="body" tone="muted">
                {currencySymbolForCode(toCurrency)}
              </Text>
              <TextInput
                value={receivedStr}
                onChangeText={handleReceivedChange}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={themeColors.textMuted}
                allowFontScaling={false}
                style={fieldStyle}
              />
            </View>
          </View>

          <View className="mt-5 flex-row items-center justify-end gap-2.5">
            <Pressable
              onPress={handleClose}
              className="rounded-pill bg-secondary/60 px-5 py-2.5"
              accessibilityRole="button"
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDone}
              className="rounded-pill bg-primary px-5 py-2.5 shadow-glow"
              accessibilityRole="button"
            >
              <Text variant="caption" tone="inverse">
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
