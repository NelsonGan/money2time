import { ChevronDown } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CurrencyPickerSheet, Input, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { withBudgetCurrency } from '~/features/budget/lib/budgetCurrency';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { enabledEntryCurrencies, formatFxRate } from '~/utils/currency';

/**
 * A budget editor's total and the currency its amounts are in, side by side
 * (as the item editor lays out a price). The currency choices are the ones the
 * entry flows record amounts in: the main currency, the sub-currencies and the
 * accounts' currencies. A currency other than the main one shows how spending
 * in other currencies will be converted, or that it cannot be yet.
 */
export function BudgetTotalField({
  label,
  total,
  onChangeTotal,
  currency,
  onChangeCurrency,
  rate,
  hint,
}: {
  label: string;
  total: string;
  onChangeTotal: (next: string) => void;
  /** The budget's currency code (the main currency when it has none of its own). */
  currency: string;
  onChangeCurrency: (code: string) => void;
  /** 1 unit of `currency` in the main currency, or null when there is no rate. */
  rate: number | null;
  /** A template converts at each budget's start; a budget at its own frozen rate. */
  hint: 'template' | 'budget';
}) {
  const { settings, fxCurrencies, accounts } = useApp();
  const themeColors = useThemeColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  const mainCurrency = settings.currencyCode;

  const currencyCodes = useMemo(
    () =>
      Array.from(
        new Set([...enabledEntryCurrencies(mainCurrency, fxCurrencies, accounts), currency]),
      ),
    [accounts, currency, fxCurrencies, mainCurrency],
  );
  // Only the main currency to pick from: no choice to offer.
  const canPick = currencyCodes.length > 1;

  const hintText =
    currency === mainCurrency
      ? null
      : rate == null
        ? I18n.t('budget.currency_hint_no_rate', { currency })
        : I18n.t(
            hint === 'template' ? 'budget.currency_hint_template' : 'budget.currency_hint_budget',
            { currency, rate: formatFxRate(rate), main: mainCurrency },
          );

  return (
    <View>
      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <Input
            label={label}
            variant="currency"
            currencySymbol={withBudgetCurrency(settings, currency).currencySymbol}
            value={total}
            onChangeText={onChangeTotal}
            placeholder="0.00"
          />
        </View>
        {canPick ? (
          <View className="w-[110px]">
            <Text variant="label" tone="muted" className="mb-2.5 px-1">
              {I18n.t('budget.currency_label')}
            </Text>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setPickerOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${I18n.t('budget.currency_label')}, ${currency}`}
              className="h-[54px] flex-row items-center justify-between rounded-[22px] border border-border/30 bg-secondary/30 px-3 active:opacity-80"
            >
              <Text variant="body">{currency}</Text>
              <ChevronDown size={16} color={themeColors.textMuted} />
            </Pressable>
          </View>
        ) : null}
      </View>
      {hintText ? (
        <Text
          variant="caption"
          className="mt-2 px-1"
          tone={rate == null ? undefined : 'muted'}
          style={rate == null ? { color: themeColors.accent } : undefined}
        >
          {hintText}
        </Text>
      ) : null}

      <CurrencyPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedCode={currency}
        restrictToCodes={currencyCodes}
        title={I18n.t('budget.currency_label')}
        onSelect={(code) => {
          onChangeCurrency(code);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}
