import type { LucideIcon } from 'lucide-react-native';
import { CalendarCheck, Percent, Wallet } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import type { LoanQuote } from '~/features/loans/lib/loanMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { formatAmount, formatShortMonthYearLabel } from '~/utils/formatters';

interface LoanQuoteBlockProps {
  /** The contract's derived numbers, or null while it is still incomplete. */
  quote: LoanQuote | null;
  currency: string;
}

interface QuoteStat {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

/**
 * What the loan contract works out to, shown live under the form. The monthly
 * instalment is the headline because it is the number the borrower is really
 * asking for; the payoff month and total interest sit in a divided row
 * beneath, mirroring the goals summary block.
 */
export function LoanQuoteBlock({ quote, currency }: LoanQuoteBlockProps) {
  const { settings, currentMonthWage } = useApp();
  const themeColors = useThemeColors();
  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  const money = useMemo(
    () => (value: number) =>
      formatAmount(value, settings, { showSign: false, trueHourlyRate, currencyCode: currency }),
    [currency, settings, trueHourlyRate],
  );

  const stats = useMemo<QuoteStat[]>(() => {
    if (!quote) return [];
    const next: QuoteStat[] = [
      {
        key: 'payoff',
        icon: CalendarCheck,
        label: String(I18n.t('accounts.loan.payoff_by_label')),
        value: formatShortMonthYearLabel(
          // The `T00:00:00` suffix is load-bearing: a bare `YYYY-MM-DD` parses
          // as UTC midnight and renders a month early west of UTC on the 1st.
          new Date(`${quote.payoffDate}T00:00:00`),
          settings.locale,
        ),
      },
    ];
    if (quote.totalInterest > 0) {
      next.push({
        key: 'interest',
        icon: Percent,
        label: String(I18n.t('accounts.loan.total_interest_label')),
        value: money(quote.totalInterest),
      });
    }
    return next;
  }, [money, quote, settings.locale]);

  if (!quote) return null;

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      <View className="px-4 pb-3 pt-3.5">
        <View className="flex-row items-center gap-1.5">
          <Wallet size={12} color={themeColors.primary} strokeWidth={2.4} />
          <Text variant="label" className="text-[10px] text-primary">
            {I18n.t('accounts.loan.instalment_label')}
          </Text>
        </View>
        <Text variant="monoLg" className="mt-1.5">
          {money(quote.instalment)}
        </Text>
      </View>

      <View className="h-px bg-border/40" />

      <View className="flex-row">
        {stats.map((stat, index) => {
          const StatIcon = stat.icon;
          return (
            <React.Fragment key={stat.key}>
              {index > 0 ? <View className="w-px bg-border/40" /> : null}
              <View className="flex-1 px-4 py-2.5">
                <View className="flex-row items-center gap-1.5">
                  <StatIcon size={12} color={themeColors.textMuted} strokeWidth={2.4} />
                  <Text variant="label" className="text-[10px]" tone="muted">
                    {stat.label}
                  </Text>
                </View>
                {/* No numberOfLines: a truncated money value hides digits,
                    which is worse than a slightly taller card. */}
                <Text variant="mono" className="mt-1">
                  {stat.value}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}
