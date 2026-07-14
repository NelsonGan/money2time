// Draft model + pure transforms for the ReceiptSplit screen. No RN imports.
// The screen holds this state; these helpers convert between the launch seed,
// the persisted ReceiptSplit record, the math module's input, and the save
// payloads (SplitDraftInput bridge rows + repository draft).

import type { SplitDraftInput } from '~/context/AppContext';
import type { ReceiptSplitDraftInput } from '~/lib/repositories/receiptSplitsRepository';
import type { ReceiptSplit, TransactionSplit } from '~/types';
import { newId } from '~/utils/id';

import type { ReceiptSplitLaunchSeed } from '../../lib/receiptSplitBridge';
import {
  computeReceiptSplit,
  friendLetter,
  itemsSubtotal,
  receiptPersonKey,
  type ReceiptSplitComputation,
  type ReceiptSplitMathInput,
} from '../../lib/receiptSplitMath';

export const ME_PERSON_ID = '__me__';

export interface DraftPerson {
  id: string;
  /** Optional custom name; empty means auto-labeled ("Person A", …). */
  name: string;
  isSelf: boolean;
}

export interface DraftShare {
  personId: string;
  weight: number;
}

export interface DraftItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number | null;
  /** Editing string, 2-decimal once committed. */
  lineTotal: string;
  lowConfidence?: boolean;
  shares: DraftShare[];
}

export interface ReceiptSplitDraft {
  items: DraftItem[];
  people: DraftPerson[];
  /** Tax + service applied on top of the item subtotal, as a percentage. */
  taxServicePercent: number;
  merchant: string;
  currency: string;
  date: string;
  receiptUri: string | null;
  categoryId: string | null;
  accountId: string | null;
  /** Per-person payback account overrides, keyed by person id. */
  paybackByPersonId: Record<string, string | null>;
  lowConfidence: boolean;
}

export const toAmountNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatDraftAmount = (value: number): string =>
  (Math.round(value * 100) / 100).toFixed(2);

export function newDraftItem(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    id: newId(),
    name: '',
    quantity: 1,
    unitPrice: null,
    lineTotal: '',
    shares: [],
    ...overrides,
  };
}

export const mePerson = (): DraftPerson => ({ id: ME_PERSON_ID, name: '', isSelf: true });

/** A fresh friend person with no custom name (auto-labeled by position). */
export const newFriend = (): DraftPerson => ({ id: newId(), name: '', isSelf: false });

/** Sum of the item line totals (excludes tax/service). */
export function draftItemsSubtotal(draft: ReceiptSplitDraft): number {
  return itemsSubtotal(draft.items.map((item) => ({ lineTotal: toAmountNumber(item.lineTotal) })));
}

/** Absolute tax/service amount = subtotal × percent, cents-rounded. */
export function draftTaxServiceAmount(draft: ReceiptSplitDraft): number {
  const subtotal = draftItemsSubtotal(draft);
  return Math.round(subtotal * (draft.taxServicePercent / 100) * 100) / 100;
}

/**
 * Map every person id to the name written on save: self → '' (bridge stores
 * null), a named friend → their trimmed name, an unnamed friend → the
 * localized "Person A" label built via `labelForLetter`.
 */
export function buildNameById(
  people: DraftPerson[],
  labelForLetter: (letter: string) => string,
): Map<string, string> {
  const map = new Map<string, string>();
  let friendIndex = 0;
  for (const person of people) {
    if (person.isSelf) {
      map.set(person.id, '');
      continue;
    }
    map.set(person.id, person.name.trim() || labelForLetter(friendLetter(friendIndex)));
    friendIndex += 1;
  }
  return map;
}

export function buildDraftFromSeed(
  seed: ReceiptSplitLaunchSeed | undefined,
  defaults: { currency: string; date: string; accountId: string | null },
): ReceiptSplitDraft {
  return {
    // Only the items are seeded from a scan — tax/service is applied by hand.
    items: (seed?.items ?? []).map((item) =>
      newDraftItem({
        name: item.name,
        quantity: item.quantity > 0 ? item.quantity : 1,
        unitPrice: item.unitPrice,
        lineTotal: formatDraftAmount(item.lineTotal),
        lowConfidence: item.lowConfidence,
      }),
    ),
    people: [mePerson(), newFriend()],
    taxServicePercent: 0,
    merchant: seed?.merchant ?? '',
    currency: seed?.currency ?? defaults.currency,
    date: seed?.date ?? defaults.date,
    receiptUri: seed?.receiptUri ?? null,
    categoryId: seed?.categoryId ?? null,
    accountId: seed?.accountId ?? defaults.accountId,
    paybackByPersonId: {},
    lowConfidence: !!seed?.lowConfidence,
  };
}

/**
 * Rebuild an editable draft from a persisted record + the transaction's
 * bridge splits (for payback accounts). People are recreated from the share
 * rows; the Me person always exists.
 */
export function buildDraftFromPersisted(
  record: ReceiptSplit,
  splits: TransactionSplit[],
  parent: { date: string; categoryId: string | null; accountId: string | null },
): ReceiptSplitDraft {
  const people: DraftPerson[] = [mePerson()];
  const personIdByKey = new Map<string, string>([[receiptPersonKey('', true), ME_PERSON_ID]]);
  const paybackByPersonId: Record<string, string | null> = {};

  const personIdFor = (name: string, isSelf: boolean): string => {
    const key = receiptPersonKey(name, isSelf);
    const existing = personIdByKey.get(key);
    if (existing) return existing;
    const person: DraftPerson = { id: newId(), name: name.trim(), isSelf: false };
    people.push(person);
    personIdByKey.set(key, person.id);
    return person.id;
  };

  const items = record.items.map((item) =>
    newDraftItem({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: formatDraftAmount(item.lineTotal),
      shares: item.shares.map((share) => ({
        personId: personIdFor(share.personName, share.isSelf),
        weight: share.weight,
      })),
    }),
  );

  for (const split of splits) {
    if (split.isSelf || !split.personName) continue;
    const personId = personIdByKey.get(receiptPersonKey(split.personName, false));
    if (personId) paybackByPersonId[personId] = split.paybackAccountId;
  }

  // Recover the applied percentage from the stored tax + service amount.
  const subtotal = record.itemsSubtotal || itemsSubtotal(record.items);
  const taxPool = record.taxAmount + record.serviceAmount;
  const taxServicePercent = subtotal > 0 ? Math.round((taxPool / subtotal) * 100) : 0;

  return {
    items,
    people,
    taxServicePercent,
    merchant: record.merchant ?? '',
    currency: record.currency,
    date: parent.date,
    receiptUri: record.receiptImageUri,
    categoryId: parent.categoryId,
    accountId: parent.accountId,
    paybackByPersonId,
    lowConfidence: false,
  };
}

export function draftToMathInput(draft: ReceiptSplitDraft): ReceiptSplitMathInput {
  const personById = new Map(draft.people.map((person) => [person.id, person]));
  return {
    items: draft.items.map((item) => ({
      id: item.id,
      lineTotal: toAmountNumber(item.lineTotal),
      shares: item.shares
        .map((share) => {
          const person = personById.get(share.personId);
          if (!person) return null;
          return { personKey: person.id, isSelf: person.isSelf, weight: share.weight };
        })
        .filter((share): share is NonNullable<typeof share> => share !== null),
    })),
    taxServiceAmount: draftTaxServiceAmount(draft),
  };
}

export function computeDraft(draft: ReceiptSplitDraft): ReceiptSplitComputation {
  return computeReceiptSplit(draftToMathInput(draft));
}

/** The repository draft persisted alongside the bridge splits on save. */
export function draftToRepositoryInput(
  draft: ReceiptSplitDraft,
  source: ReceiptSplitDraftInput['source'],
  nameById: Map<string, string>,
): ReceiptSplitDraftInput {
  const subtotal = draftItemsSubtotal(draft);
  const taxService = draftTaxServiceAmount(draft);
  return {
    currency: draft.currency,
    merchant: draft.merchant.trim() || null,
    receiptDate: draft.date,
    itemsSubtotal: subtotal,
    taxAmount: taxService,
    serviceAmount: 0,
    discountAmount: 0,
    adjustmentAmount: 0,
    totalAmount: subtotal + taxService,
    source,
    receiptImageUri: draft.receiptUri,
    items: draft.items.map((item) => ({
      name: item.name.trim() || item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: toAmountNumber(item.lineTotal),
      isAdjustment: false,
      shares: item.shares
        .map((share) => {
          const person = draft.people.find((p) => p.id === share.personId);
          if (!person) return null;
          return {
            personName: person.isSelf ? '' : (nameById.get(person.id) ?? ''),
            isSelf: person.isSelf,
            weight: share.weight,
          };
        })
        .filter((share): share is NonNullable<typeof share> => share !== null),
    })),
  };
}

/**
 * Bridge rows from the computed per-person totals. Friends owing 0 are
 * skipped (Settle Up ignores them anyway); the Me share is the isSelf row.
 * When editing, prior rows are matched by materialized name so ids (and paid
 * state) carry over.
 */
export function draftToSplitInputs(
  draft: ReceiptSplitDraft,
  computation: ReceiptSplitComputation,
  fallbackPaybackAccountId: string | null,
  nameById: Map<string, string>,
  priorSplits: TransactionSplit[] = [],
): SplitDraftInput[] {
  const priorByKey = new Map<string, TransactionSplit>();
  for (const split of priorSplits) {
    priorByKey.set(receiptPersonKey(split.personName ?? '', split.isSelf), split);
  }

  const inputs: SplitDraftInput[] = [];
  for (const person of computation.perPerson) {
    if (!person.isSelf && person.total <= 0) continue;
    const name = person.isSelf ? null : (nameById.get(person.personKey) ?? '');
    const nameKey = receiptPersonKey(name ?? '', person.isSelf);
    const prior = priorByKey.get(nameKey);
    const payback =
      draft.paybackByPersonId[person.personKey] ??
      prior?.paybackAccountId ??
      fallbackPaybackAccountId;
    inputs.push({
      id: prior?.id,
      personName: name,
      amount: person.total,
      isSelf: person.isSelf,
      paybackAccountId: person.isSelf ? null : payback,
      sortOrder: inputs.length,
      paid: prior?.paidAt
        ? { paidAt: prior.paidAt, paidTransactionId: prior.paidTransactionId }
        : undefined,
    });
  }
  return inputs;
}

/**
 * People whose settled (paid) bridge row would change amount under the new
 * computation — saving must be blocked until they're marked unpaid. Returns
 * the materialized names.
 */
export function paidConflicts(
  computation: ReceiptSplitComputation,
  priorSplits: TransactionSplit[],
  nameById: Map<string, string>,
): string[] {
  const totalsByNameKey = new Map<string, number>();
  for (const person of computation.perPerson) {
    const name = person.isSelf ? '' : (nameById.get(person.personKey) ?? '');
    totalsByNameKey.set(receiptPersonKey(name, person.isSelf), person.total);
  }

  const names: string[] = [];
  for (const split of priorSplits) {
    if (!split.paidAt || split.isSelf) continue;
    const key = receiptPersonKey(split.personName ?? '', split.isSelf);
    const nextTotal = totalsByNameKey.get(key) ?? 0;
    if (Math.round(nextTotal * 100) !== Math.round(split.amount * 100)) {
      names.push(split.personName ?? '');
    }
  }
  return names;
}
