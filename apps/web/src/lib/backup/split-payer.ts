/**
 * Who paid a split bill, as the app stores it (its migration 089 and
 * features/transactions/lib/splitPayer.ts). A bill the user paid holds what
 * each friend owes in `amount`. A bill a friend paid is the other way round:
 * the expense is the user's own share (the Me row), owed to that friend, whose
 * row carries `is_payer`; every friend's row keeps `amount` at 0 and holds its
 * share of the bill in `share_amount`. The payer row's `paid_at` is when the
 * user paid the last of it back. A part paid before that is a paid row under
 * the payer's (`part_of_split_id`) holding the part in `share_amount`, and the
 * bill and its Me row are what is still owed. Rows from an app before this
 * carry neither column and read as a bill the user paid. No imports, so the
 * tests can load it.
 */

export type PayerSplit = {
  id: string;
  transaction_id: string;
  person_name?: string | null;
  amount: number;
  is_self?: number | boolean | null;
  paid_at?: string | null;
  part_of_split_id?: string | null;
  is_payer?: number | boolean | null;
  share_amount?: number | null;
  member_id?: string | null;
};

/**
 * The key a person's shares are grouped under (the app's `debtPartyKey`): the
 * Cloud Sync account when the person is a real user, else the case-folded
 * name, so linking a name to an account later only changes this.
 */
export function partyKey(personName: string | null | undefined, memberId?: string | null): string {
  if (memberId) return `member:${memberId}`;
  return (personName ?? "").trim().toLocaleLowerCase();
}

/** A part of their own share the user has already paid the payer (the app's `isPayBackPart`). */
export function isPayBackPart(split: PayerSplit): boolean {
  return !split.is_self && !!split.part_of_split_id && split.share_amount != null && !!split.paid_at;
}

/** The friend who paid the bill among its rows, or null when the user did (the app's `billPayer`). */
export function billPayer<T extends PayerSplit>(rows: readonly T[]): T | null {
  return rows.find((row) => !!row.is_payer && !row.is_self && !row.part_of_split_id) ?? null;
}

/** What the user owes on one bill a friend paid (the app's `owedToPayer`). */
/**
 * The shared album's bills the user is said to have paid that are on none of
 * their accounts: someone else saved them naming the user as payer, and they
 * wait for the user to pick the account in the app (the app's
 * `needsAccountConfirm`). A bill a friend paid is on no account for another
 * reason, so it is left out.
 */
export function awaitingAccount(
  txs: Iterable<{ id: string; type: string; accountId: string | null; albumGroupId?: string }>,
  splits: readonly PayerSplit[],
): Set<string> {
  const byTx = new Map<string, PayerSplit[]>();
  for (const split of splits) {
    const rows = byTx.get(split.transaction_id);
    if (rows) rows.push(split);
    else byTx.set(split.transaction_id, [split]);
  }
  const ids = new Set<string>();
  for (const tx of txs) {
    if (!tx.albumGroupId || tx.type !== "expense" || tx.accountId) continue;
    const rows = byTx.get(tx.id) ?? [];
    if (rows.some((row) => !row.is_self) && !billPayer(rows)) ids.add(tx.id);
  }
  return ids;
}

export type OwedToPayer = {
  txId: string;
  /** The payer's row. */
  splitId: string;
  /** The payer's name, trimmed; empty when never named. */
  person: string;
  /** The key the payer's balance is grouped under (`partyKey`). */
  key: string;
  /** What is left of the user's share after the parts already paid, in the bill's currency. */
  amount: number;
  /** When the user paid it back; null while it is owed. */
  paidAt: string | null;
};

/**
 * The user's debt on every bill a friend paid, one entry per bill. The share
 * is the Me row's amount, else `expenseAmount` (the expense itself) for a bill
 * without one.
 */
export function owedToPayers<T extends PayerSplit>(splits: readonly T[], expenseAmount: (txId: string) => number): OwedToPayer[] {
  const byTx = new Map<string, T[]>();
  for (const split of splits) {
    const rows = byTx.get(split.transaction_id);
    if (rows) rows.push(split);
    else byTx.set(split.transaction_id, [split]);
  }
  const owed: OwedToPayer[] = [];
  for (const [txId, rows] of byTx) {
    const payer = billPayer(rows);
    if (!payer) continue;
    const self = rows.find((row) => !!row.is_self);
    owed.push({
      txId,
      splitId: payer.id,
      person: (payer.person_name ?? "").trim(),
      key: partyKey(payer.person_name, payer.member_id),
      amount: Math.round((self ? self.amount : expenseAmount(txId)) * 100) / 100,
      paidAt: payer.paid_at ?? null,
    });
  }
  return owed;
}

/** One person's balance with the user: positive when they owe the user, negative when the user owes them. */
export type PersonBalance = { person: string; net: number; count: number };

/**
 * Open shares netted per person, the biggest balance (either way) first, as
 * the app's Balances lists people (`aggregateSettleUpByPerson`). People are
 * grouped by case-folded name; amounts are kept to the cent at each step.
 */
export function netByPerson(
  owesYou: readonly { person: string; key?: string; amountBase: number }[],
  youOwe: readonly { person: string; key?: string; amountBase: number }[],
): PersonBalance[] {
  const map = new Map<string, PersonBalance>();
  const add = (person: string, amount: number, partyKeyOf?: string) => {
    const key = partyKeyOf ?? person.toLocaleLowerCase();
    const entry = map.get(key) ?? { person, net: 0, count: 0 };
    entry.net = Math.round((entry.net + amount) * 100) / 100;
    entry.count += 1;
    map.set(key, entry);
  };
  for (const debt of owesYou) add(debt.person, debt.amountBase, debt.key);
  for (const debt of youOwe) add(debt.person, -debt.amountBase, debt.key);
  return [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

/** A share still owed, either way, with the bill it is on. */
type OpenShare = { person: string; key?: string; amountBase: number; txId: string };

/** An album with something still owed in it, and the user's net there. */
type AlbumBalance = { id: string; name: string; net: number; people: PersonBalance[] };

/**
 * Balances as the app keeps them: an album answers for the bills in it, and
 * the people list for the bills in no album (the app's
 * `getAlbumOwnedTransactionIds`, `useAlbumBalances`). Albums with nothing open
 * are left out; a bill in two albums counts in both, as in the app.
 */
export function balancesByAlbum(
  owesYou: readonly OpenShare[],
  youOwe: readonly OpenShare[],
  albums: readonly { id: string; name: string; txIds: readonly string[] }[],
): { people: PersonBalance[]; albums: AlbumBalance[] } {
  const inAlbums = new Set(albums.flatMap((album) => album.txIds));
  const outside = (debt: OpenShare) => !inAlbums.has(debt.txId);
  return {
    people: netByPerson(owesYou.filter(outside), youOwe.filter(outside)),
    albums: albums.flatMap((album) => {
      const ids = new Set(album.txIds);
      const inAlbum = (debt: OpenShare) => ids.has(debt.txId);
      const people = netByPerson(owesYou.filter(inAlbum), youOwe.filter(inAlbum));
      if (people.length === 0) return [];
      const net = Math.round(people.reduce((sum, person) => sum + person.net, 0) * 100) / 100;
      return [{ id: album.id, name: album.name, net, people }];
    }),
  };
}
