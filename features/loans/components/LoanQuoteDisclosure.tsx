import { ChevronDown, ChevronUp } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import type { LoanQuote } from '~/features/loans/lib/loanMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { formatAmount, formatShortDate } from '~/utils/formatters';

interface LoanQuoteDisclosureProps {
  /** The contract's derived numbers, or null while it is still incomplete. */
  quote: LoanQuote | null;
  currency: string;
}

/**
 * What the loan contract works out to, as a disclosure rather than a card.
 *
 * The form is a column of input fields; a filled stat card dropped into the
 * middle of it read as a foreign object. This keeps the one number the
 * borrower is really asking for — the monthly instalment — always visible on
 * a single row, and folds the rest of the derived figures into a table they
 * can open when they want the detail.
 */
export function LoanQuoteDisclosure({ quote, currency }: LoanQuoteDisclosureProps) {
  const { settings, currentMonthWage } = useApp();
  const themeColors = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  const rows = useMemo(() => {
    if (!quote) return [];
    const money = (value: number) =>
      formatAmount(value, settings, { showSign: false, trueHourlyRate, currencyCode: currency });
    // The `T00:00:00` suffix is load-bearing: a bare `YYYY-MM-DD` parses as
    // UTC midnight and renders a day early west of UTC.
    const date = (dayKey: string) => formatShortDate(`${dayKey}T00:00:00`, settings.locale);

    return [
      {
        key: 'interest',
        label: String(I18n.t('accounts.loan.total_interest_label')),
        value: money(quote.totalInterest),
      },
      {
        key: 'first',
        label: String(I18n.t('accounts.loan.first_instalment_label')),
        value: date(quote.firstInstalmentDate),
      },
      {
        key: 'payoff',
        label: String(I18n.t('accounts.loan.payoff_by_label')),
        value: date(quote.payoffDate),
      },
      {
        key: 'remaining',
        label: String(I18n.t('accounts.loan.instalments_left_label')),
        value: String(quote.remainingPeriods),
      },
    ];
  }, [currency, quote, settings, trueHourlyRate]);

  if (!quote) return null;

  return (
    <View className="overflow-hidden rounded-2xl border border-border/45 bg-card">
      <Pressable
        onPress={() => setExpanded((previous) => !previous)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={String(I18n.t('accounts.loan.instalment_label'))}
        className="flex-row items-center justify-between gap-3 px-4 py-3.5"
      >
        <View className="flex-1">
          <Text variant="label" className="text-[10px] text-primary">
            {I18n.t('accounts.loan.instalment_label')}
          </Text>
          <Text variant="mono" className="mt-1">
            {formatAmount(quote.instalment, settings, {
              showSign: false,
              trueHourlyRate,
              currencyCode: currency,
            })}
          </Text>
        </View>
        {expanded ? (
          <ChevronUp size={18} color={themeColors.textMuted} />
        ) : (
          <ChevronDown size={18} color={themeColors.textMuted} />
        )}
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(160)}>
          <View className="h-px bg-border/40" />
          {rows.map((row, index) => (
            <View key={row.key}>
              {index > 0 ? <View className="h-px bg-border/25" /> : null}
              <View className="flex-row items-center justify-between gap-3 px-4 py-2.5">
                <Text variant="caption" tone="muted" className="flex-1">
                  {row.label}
                </Text>
                {/* No numberOfLines: a truncated money value hides digits,
                    which is worse than a slightly taller row. */}
                <Text variant="caption" className="text-right">
                  {row.value}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
