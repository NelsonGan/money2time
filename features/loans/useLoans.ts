import { useMemo } from 'react';

import { useApp, useTransactions } from '~/context/AppContext';
import type { LoanWithProgress } from '~/types';
import { dayKeyFromDateLocal } from '~/utils/formatters';

import { computeLoanProgress } from './lib/loanMath';

export interface LoansState {
  active: LoanWithProgress[];
  archived: LoanWithProgress[];
}

/**
 * All loans with derived progress, split active/archived. Reads live balances,
 * so consumers re-render on transaction churn — mount this only on loan
 * surfaces, not in broad settings screens.
 */
export function useLoans(): LoansState {
  const { accounts, isSimpleMode } = useApp();
  const { accountBalances } = useTransactions();
  const todayIso = dayKeyFromDateLocal(new Date());

  return useMemo(() => {
    // Simple mode has no accounts surface; loans are Power-mode only.
    if (isSimpleMode) return { active: [], archived: [] };
    const balanceById = new Map(accountBalances.map((b) => [b.accountId, b.balance]));
    const active: LoanWithProgress[] = [];
    const archived: LoanWithProgress[] = [];
    for (const account of accounts) {
      if (account.type !== 'loan') continue;
      // Balances lag one refresh right after account creation; the starting
      // balance is the correct value until the aggregate catches up.
      const balance = balanceById.get(account.id) ?? account.startingBalance;
      const progress = computeLoanProgress({
        balance,
        originalPrincipal: account.loanOriginalPrincipal ?? account.startingBalance,
        monthlyPayment: account.loanMonthlyPayment ?? 0,
        paymentDay: account.loanPaymentDay ?? null,
        annualRatePercent: account.loanInterestRate ?? null,
        paidOffAt: account.loanPaidOffAt ?? null,
        todayIso,
      });
      (account.loanArchivedAt ? archived : active).push({ account, progress });
    }
    return { active, archived };
  }, [accounts, accountBalances, isSimpleMode, todayIso]);
}
