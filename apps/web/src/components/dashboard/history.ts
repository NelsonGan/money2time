import { dayKeyOf, financialMonthRange } from "@/lib/backup/dates";
import {
  accrueReducingBalance,
  loanAccrualRatePercent,
  loanAccruesInterest,
  loanLedgerAnchor,
  loanRateChanges,
} from "@/lib/backup/loans";
import type { Account, Model, Movement } from "@/lib/backup/model";

/**
 * Each account's balance at the end of every month in `months`, converted to
 * the main currency at today's rates (as the app's asset history does; an
 * account with no rate counts its own balance), and signed for net worth:
 * liabilities are negative. Loans that charge interest are walked to each
 * month end, so their history includes it.
 */
export function balanceHistory(model: Model, months: string[], accounts: Account[]) {
  const ends = months.map((month) => dayKeyOf(financialMonthRange(month, model.cycle).end));
  const byAccount = new Map<string, Movement[]>();
  for (const m of model.movements) {
    const list = byAccount.get(m.accountId);
    if (list) list.push(m);
    else byAccount.set(m.accountId, [m]);
  }

  const todayKey = dayKeyOf(model.today);
  const result = new Map<string, number[]>();
  for (const account of accounts) {
    const moves = (byAccount.get(account.id) ?? []).sort((a, b) => (a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0));
    const start = account.raw.starting_balance ?? 0;
    const rate = model.toBase(1, account.currency) ?? 1;
    const interest = account.type === "loan" && loanAccruesInterest(account.raw);
    // As in the app's asset history, the starting balance counts from the
    // start: an account added later still shows it in earlier months.
    const values: number[] = [];
    let index = 0;
    let running = 0;
    for (const end of ends) {
      while (index < moves.length && moves[index].dayKey <= end) {
        running += account.liability ? moves[index].liability : moves[index].asset;
        index += 1;
      }
      let balance = start + running;
      if (interest) {
        // Interest stops at the backup: the app does not charge the months
        // after it, so neither does the chart.
        const until = end < todayKey ? end : todayKey;
        // Which month a movement falls in is the phone's local day, as for
        // every other account here and in the app's asset history; the walk
        // itself still reads each row's stored date, as the model's does.
        balance = accrueReducingBalance({
          openingBalance: start,
          anchorDate: loanLedgerAnchor(account.raw, until),
          annualRatePercent: loanAccrualRatePercent(account.raw),
          rateChanges: loanRateChanges(account.raw),
          movements: moves.filter((m) => m.dayKey <= until).map((m) => ({ date: m.date, delta: m.liability })),
          todayKey: until,
        }).balance;
      }
      const base = balance * rate;
      values.push(account.liability ? -base : base);
    }
    result.set(account.id, values);
  }
  return result;
}
