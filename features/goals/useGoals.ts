import { useMemo } from 'react';

import { useApp, useTransactions } from '~/context/AppContext';
import type { GoalWithProgress } from '~/types';
import { dayKeyFromDateLocal } from '~/utils/formatters';

import { computeGoalProgress, monthlyEquivalentRate } from './lib/goalMath';

export interface GoalsState {
  active: GoalWithProgress[];
  archived: GoalWithProgress[];
}

/**
 * All savings goals with derived progress, split active/archived. Reads live
 * balances, so consumers re-render on transaction churn — mount this only on
 * goal surfaces, not in broad settings screens.
 */
export function useGoals(): GoalsState {
  const { accounts, recurringRules, isSimpleMode } = useApp();
  const { accountBalances } = useTransactions();
  const todayIso = dayKeyFromDateLocal(new Date());

  return useMemo(() => {
    // Simple mode has no accounts surface; goals are Power-mode only.
    if (isSimpleMode) return { active: [], archived: [] };
    const balanceById = new Map(accountBalances.map((b) => [b.accountId, b.balance]));
    const active: GoalWithProgress[] = [];
    const archived: GoalWithProgress[] = [];
    for (const account of accounts) {
      if (account.type !== 'goal') continue;
      const progress = computeGoalProgress({
        // Balances lag one refresh right after account creation; the starting
        // balance is the correct value until the aggregate catches up.
        balance: balanceById.get(account.id) ?? account.startingBalance,
        startingBalance: account.startingBalance,
        target: account.goalTargetAmount ?? 0,
        createdAt: account.createdAt,
        targetDate: account.goalTargetDate ?? null,
        achievedAt: account.goalAchievedAt ?? null,
        monthlyRate: monthlyEquivalentRate(recurringRules, account.id),
        todayIso,
      });
      (account.goalArchivedAt ? archived : active).push({ account, progress });
    }
    return { active, archived };
  }, [accounts, accountBalances, isSimpleMode, recurringRules, todayIso]);
}
