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
  receiptPersonKey,
  type ReceiptSplitComputation,
  type ReceiptSplitMathInput,
} from '../../lib/receiptSplitMath';

export const ME_PERSON_ID = '__me__';

export interface DraftPerson {
  id: string;
  /** Display name; empty for the Me person. */
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
  isAdjustment: boolean;
  lowConfidence?: boolean;
  shares: DraftShare[];
}

export interface ReceiptSplitDraft {
  items: DraftItem[];
  people: DraftPerson[];
  tax: string;
  service: string;
  discount: string;
  total: string;
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
    isAdjustment: false,
    shares: [],
    ...overrides,
  };
}

export const mePerson = (): DraftPerson => ({ id: ME_PERSON_ID, name: '', isSelf: true });

export function buildDraftFromSeed(
  seed: ReceiptSplitLaunchSeed | undefined,
  defaults: { currency: string; date: string; accountId: string | null },
): ReceiptSplitDraft {
  return {
    items: (seed?.items ?? []).map((item) =>
      newDraftItem({
        name: item.name,
        quantity: item.quantity > 0 ? item.quantity : 1,
        unitPrice: item.unitPrice,
        lineTotal: formatDraftAmount(item.lineTotal),
        lowConfidence: item.lowConfidence,
      }),
    ),
    people: [mePerson()],
    tax: formatDraftAmount(seed?.tax ?? 0),
    service: formatDraftAmount(seed?.service ?? 0),
    discount: formatDraftAmount(seed?.discount ?? 0),
    total: seed ? formatDraftAmount(seed.total) : '',
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
      isAdjustment: item.isAdjustment,
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

  return {
    items,
    people,
    tax: formatDraftAmount(record.taxAmount),
    service: formatDraftAmount(record.serviceAmount),
    discount: formatDraftAmount(record.discountAmount),
    total: formatDraftAmount(record.totalAmount),
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
          return { personName: person.name, isSelf: person.isSelf, weight: share.weight };
        })
        .filter((share): share is NonNullable<typeof share> => share !== null),
    })),
    tax: toAmountNumber(draft.tax),
    service: toAmountNumber(draft.service),
    discount: toAmountNumber(draft.discount),
    adjustment: 0,
    total: toAmountNumber(draft.total),
  };
}

export function computeDraft(draft: ReceiptSplitDraft): ReceiptSplitComputation {
  return computeReceiptSplit(draftToMathInput(draft));
}

/** The repository draft persisted alongside the bridge splits on save. */
export function draftToRepositoryInput(
  draft: ReceiptSplitDraft,
  source: ReceiptSplitDraftInput['source'],
): ReceiptSplitDraftInput {
  const personById = new Map(draft.people.map((person) => [person.id, person]));
  const itemsSubtotal = draft.items.reduce((acc, item) => acc + toAmountNumber(item.lineTotal), 0);
  return {
    currency: draft.currency,
    merchant: draft.merchant.trim() || null,
    receiptDate: draft.date,
    itemsSubtotal,
    taxAmount: toAmountNumber(draft.tax),
    serviceAmount: toAmountNumber(draft.service),
    discountAmount: toAmountNumber(draft.discount),
    adjustmentAmount: 0,
    totalAmount: toAmountNumber(draft.total),
    source,
    receiptImageUri: draft.receiptUri,
    items: draft.items.map((item) => ({
      name: item.name.trim() || item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: toAmountNumber(item.lineTotal),
      isAdjustment: item.isAdjustment,
      shares: item.shares
        .map((share) => {
          const person = personById.get(share.personId);
          if (!person) return null;
          return {
            personName: person.isSelf ? '' : person.name.trim(),
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
 * When editing, prior rows are matched by person key so ids (and paid state)
 * carry over.
 */
export function draftToSplitInputs(
  draft: ReceiptSplitDraft,
  computation: ReceiptSplitComputation,
  fallbackPaybackAccountId: string | null,
  priorSplits: TransactionSplit[] = [],
): SplitDraftInput[] {
  const priorByKey = new Map<string, TransactionSplit>();
  for (const split of priorSplits) {
    priorByKey.set(receiptPersonKey(split.personName ?? '', split.isSelf), split);
  }
  const personIdByKey = new Map(
    draft.people.map((person) => [receiptPersonKey(person.name, person.isSelf), person.id]),
  );

  const inputs: SplitDraftInput[] = [];
  for (const person of computation.perPerson) {
    if (!person.isSelf && person.total <= 0) continue;
    const prior = priorByKey.get(person.personKey);
    const personId = personIdByKey.get(person.personKey);
    const payback =
      (personId ? draft.paybackByPersonId[personId] : undefined) ??
      prior?.paybackAccountId ??
      fallbackPaybackAccountId;
    inputs.push({
      id: prior?.id,
      personName: person.isSelf ? null : person.personName,
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
 * computation — saving must be blocked until they're marked unpaid.
 */
export function paidConflicts(
  computation: ReceiptSplitComputation,
  priorSplits: TransactionSplit[],
): string[] {
  const names: string[] = [];
  const totalsByKey = new Map(computation.perPerson.map((p) => [p.personKey, p.total]));
  for (const split of priorSplits) {
    if (!split.paidAt || split.isSelf) continue;
    const key = receiptPersonKey(split.personName ?? '', split.isSelf);
    const nextTotal = totalsByKey.get(key) ?? 0;
    if (Math.round(nextTotal * 100) !== Math.round(split.amount * 100)) {
      names.push(split.personName ?? '');
    }
  }
  return names;
}
