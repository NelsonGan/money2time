/**
 * What the user is owed or owes in a shared album, from its group's debts.
 * Pure: no database, no clock.
 *
 * The figure is the group's, the same the album's Balances tab opens on and
 * the Balances page lists it with: payments past a share and on deleted bills
 * included (`openShares`). Each pair's own debts and the simplified ones come
 * to the same net for everyone, so either list, or the open shares
 * themselves, gives the same figure.
 */

import { currencyOrder } from '~/features/transactions/lib/settleUp';

import { cents } from './albumGroup';

/** A debt between two members, as `GroupDebt` and the open shares both are. */
interface Debt {
  from: string;
  to: string;
  currency: string;
  amount: number;
}

export interface SelfNet {
  /** Whether the user owes or is owed anything in the album, even if it nets to nothing. */
  involved: boolean;
  /**
   * The user's net in each currency it is not even in, never converted: owed
   * to them above zero. The reporting currency first (`currencyOrder`).
   */
  byCurrency: { currency: string; amount: number }[];
}

export const NO_SELF_NET: SelfNet = { involved: false, byCurrency: [] };

export function selfNet(
  debts: readonly Debt[],
  selfId: string | null,
  reportingCurrency: string,
): SelfNet {
  if (!selfId) return NO_SELF_NET;
  let involved = false;
  const byCurrency = new Map<string, number>();
  for (const debt of debts) {
    const sign = debt.to === selfId ? 1 : debt.from === selfId ? -1 : 0;
    if (!sign) continue;
    involved = true;
    byCurrency.set(debt.currency, (byCurrency.get(debt.currency) ?? 0) + sign * cents(debt.amount));
  }
  if (!involved) return NO_SELF_NET;
  return {
    involved,
    byCurrency: [...byCurrency.keys()]
      .filter((currency) => byCurrency.get(currency) !== 0)
      .sort(currencyOrder(reportingCurrency))
      .map((currency) => ({ currency, amount: byCurrency.get(currency)! / 100 })),
  };
}
