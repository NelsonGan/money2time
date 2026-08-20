import type { LucideIcon } from 'lucide-react-native';
import { CalendarCheck, Clock, Percent, Repeat, TriangleAlert } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { computeLoanProgress } from '~/features/loans/lib/loanMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { dayKeyFromDateLocal, formatAmount, formatShortMonthYearLabel } from '~/utils/formatters';

interface LoanEditorProjectionProps {
  /** Balance owed, as typed into the editor. */
  balance: number;
  principal: number;
  monthlyPayment: number;
  paymentDay: number;
  annualRatePercent: number | null;
  currency: string;
}

interface ProjectionStat {
  key: string;
  icon: LucideIcon;
  label: string;
  value: string;
}

/**
 * Live payoff estimate under the loan fields, as a stat block rather than
 * prose: the payoff month is the headline, the supporting figures sit in a
 * divided row beneath it. Mirrors the goals summary block so the two
 * forward-looking surfaces read the same. Recomputes as the user types, and
 * collapses to a single warning when the repayment loses to the interest.
 */
export function LoanEditorProjection({
  balance,
  principal,
  monthlyPayment,
  paymentDay,
  annualRatePercent,
  currency,
}: LoanEditorProjectionProps) {
  const { settings, currentMonthWage } = useApp();
  const themeColors = useThemeColors();

  const progress = useMemo(() => {
    if (!Number.isFinite(balance) || !Number.isFinite(monthlyPayment) || monthlyPayment <= 0) {
      return null;
    }
    return computeLoanProgress({
      balance,
      originalPrincipal: Number.isFinite(principal) && principal > 0 ? principal : balance,
      monthlyPayment,
      paymentDay:
        Number.isInteger(paymentDay) && paymentDay >= 1 && paymentDay <= 31 ? paymentDay : null,
      annualRatePercent,
      todayIso: dayKeyFromDateLocal(new Date()),
    });
  }, [annualRatePercent, balance, monthlyPayment, paymentDay, principal]);

  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  const stats = useMemo<ProjectionStat[]>(() => {
    if (!progress || progress.isPaidOff || progress.paymentsRemaining == null) return [];
    const next: ProjectionStat[] = [];
    if (progress.projectedPayoffDate) {
      next.push({
        key: 'payoff',
        icon: CalendarCheck,
        label: String(I18n.t('accounts.loan.payoff_by_label')),
        value: formatShortMonthYearLabel(
          // The `T00:00:00` suffix is load-bearing: a bare `YYYY-MM-DD` parses
          // as UTC midnight and renders a month early west of UTC on the 1st.
          new Date(`${progress.projectedPayoffDate}T00:00:00`),
          settings.locale,
        ),
      });
    }
    next.push({
      key: 'payments',
      icon: Repeat,
      label: String(I18n.t('accounts.loan.payments_left_label')),
      value: String(progress.paymentsRemaining),
    });
    if (progress.estimatedInterestRemaining != null && progress.estimatedInterestRemaining > 0) {
      next.push({
        key: 'interest',
        icon: Percent,
        label: String(I18n.t('accounts.loan.est_interest_label')),
        value: formatAmount(progress.estimatedInterestRemaining, settings, {
          showSign: false,
          trueHourlyRate,
          currencyCode: currency,
        }),
      });
    } else if (settings.displayMode === 'time') {
      // Without a rate there is no interest figure to show, and in time mode
      // the balance in work hours is the one number the form cannot otherwise
      // give: the amount field above is a raw number, not a conversion.
      next.push({
        key: 'remaining',
        icon: Clock,
        label: String(I18n.t('accounts.loan.remaining_label')),
        value: formatAmount(progress.remaining, settings, {
          showSign: false,
          trueHourlyRate,
          currencyCode: currency,
        }),
      });
    }
    return next;
  }, [currency, progress, settings, trueHourlyRate]);

  if (!progress) return null;

  if (!progress.paymentCoversInterest) {
    return (
      <View className="flex-row items-center gap-2.5 rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3">
        <TriangleAlert size={16} color={themeColors.error} strokeWidth={2.4} />
        <Text variant="caption" tone="error" className="flex-1">
          {I18n.t('accounts.loan.payment_below_interest_short')}
        </Text>
      </View>
    );
  }

  if (stats.length === 0) return null;

  const [hero, ...rest] = stats;
  const HeroIcon = hero!.icon;

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      <View className="px-4 pb-3 pt-3.5">
        <View className="flex-row items-center gap-1.5">
          <HeroIcon size={12} color={themeColors.primary} strokeWidth={2.4} />
          <Text variant="label" className="text-[10px] text-primary">
            {hero!.label}
          </Text>
        </View>
        <Text variant="monoLg" className="mt-1.5">
          {hero!.value}
        </Text>
      </View>

      {rest.length > 0 ? (
        <>
          <View className="h-px bg-border/40" />
          <View className="flex-row">
            {rest.map((stat, index) => {
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
        </>
      ) : null}
    </View>
  );
}
