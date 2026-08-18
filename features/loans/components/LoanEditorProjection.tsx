import React, { useMemo } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { computeLoanProgress } from '~/features/loans/lib/loanMath';
import { I18n } from '~/lib/i18n';
import { dayKeyFromDateLocal, formatAmount, formatShortDate } from '~/utils/formatters';

interface LoanEditorProjectionProps {
  /** Balance owed, as typed into the editor. */
  balance: number;
  principal: number;
  monthlyPayment: number;
  paymentDay: number;
  annualRatePercent: number | null;
  currency: string;
}

/**
 * Live payoff estimate under the loan fields. Recomputes as the user types,
 * and turns into a warning when the repayment loses to the interest.
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

  if (!progress) return null;

  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  if (!progress.paymentCoversInterest) {
    return (
      <View className="rounded-2xl border border-destructive/25 bg-destructive/8 px-4 py-3">
        <Text variant="caption" tone="error">
          {I18n.t('accounts.loan.payment_below_interest_warning')}
        </Text>
      </View>
    );
  }

  if (progress.isPaidOff || progress.paymentsRemaining == null) return null;

  return (
    <View className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 gap-1">
      <Text variant="caption" tone="muted">
        {progress.projectedPayoffDate
          ? I18n.t(
              progress.paymentsRemaining === 1
                ? 'accounts.loan.projection_with_date_one'
                : 'accounts.loan.projection_with_date_other',
              {
                // The `T00:00:00` suffix is load-bearing: a bare `YYYY-MM-DD`
                // parses as UTC midnight and renders a day early west of UTC.
                date: formatShortDate(`${progress.projectedPayoffDate}T00:00:00`, settings.locale),
                count: progress.paymentsRemaining,
              },
            )
          : I18n.t(
              progress.paymentsRemaining === 1
                ? 'accounts.loan.projection_payments_only_one'
                : 'accounts.loan.projection_payments_only_other',
              { count: progress.paymentsRemaining },
            )}
      </Text>
      <Text variant="caption" tone="muted">
        {I18n.t('accounts.loan.projection_remaining', {
          amount: formatAmount(progress.remaining, settings, {
            showSign: false,
            trueHourlyRate,
            currencyCode: currency,
          }),
        })}
      </Text>
      {progress.estimatedInterestRemaining != null && progress.estimatedInterestRemaining > 0 ? (
        <Text variant="caption" tone="muted">
          {I18n.t('accounts.loan.projection_interest', {
            amount: formatAmount(progress.estimatedInterestRemaining, settings, {
              showSign: false,
              trueHourlyRate,
              currencyCode: currency,
            }),
          })}
        </Text>
      ) : null}
    </View>
  );
}
