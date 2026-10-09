import type { PersonDebt, TransactionDebt } from '~/types';

function contains(value: string | null | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query) ?? false;
}

/** Search every person's name and full bill history, including paid shares. */
export function filterSettleUpPeople(people: PersonDebt[], query: string): PersonDebt[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return people;
  return people.filter(
    (person) =>
      contains(person.name, normalized) ||
      person.bills.some(
        (bill) => contains(bill.note, normalized) || contains(bill.categoryName, normalized),
      ),
  );
}

/** Search bill details and every person's share, whether paid or unpaid. */
export function filterSettleUpTransactions(
  transactions: TransactionDebt[],
  query: string,
): TransactionDebt[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return transactions;
  return transactions.filter(
    (bill) =>
      contains(bill.note, normalized) ||
      contains(bill.categoryName, normalized) ||
      bill.splits.some((split) => contains(split.personName, normalized)),
  );
}
