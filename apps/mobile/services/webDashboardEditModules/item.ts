/**
 * Web Dashboard edits: Items: create, edit and delete (ItemEditorScreen).
 * Planned on the phone like the app's own editor; applied by
 * features/settings/lib/webDashboardApply/item.ts.
 *
 *   create { item }          update { id, at, item }          delete { id, at }
 *   reorder { ids }          every item, in the order ItemsScreen's drag leaves them
 *
 * `item` is the whole form, as the editor saves it on every save: name, icon,
 * purchase price and currency, purchase day, end day and sale price (only on an
 * inactive item), note. Icons are the bundled library's; an uploaded (custom)
 * icon cannot be chosen from the web, only kept.
 */

import { PRO_LIMITS } from '~/constants/proLimits';
import type { Item } from '~/types';

import type { EditModule, ModuleOp } from '../webDashboardEdits';

/** What the planner reads from the app (the apply module's `select`). */
export type ItemExtra = {
  items: Item[];
  /** The currencies the editor offers: the main one and the added ones. */
  currencies: string[];
  /** Whether an id is in the bundled item-icon library. */
  isIcon: (id: string) => boolean;
};

export type ItemFields = {
  name: string;
  iconId: string | null;
  purchasePrice: number;
  currency: string;
  purchaseDate: string;
  endDate: string | null;
  salePrice: number | null;
  note: string;
};

type ItemOp =
  | { entity: 'module:item'; op: 'create'; item: ItemFields }
  | { entity: 'module:item'; op: 'update'; id: string; at: string | null; item: ItemFields }
  | { entity: 'module:item'; op: 'delete'; id: string; at: string | null }
  | { entity: 'module:item'; op: 'reorder'; ids: string[] };

const MAX_NAME = 80;
const MAX_NOTE = 500;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;
const isAt = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';
const isMoney = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
const isDay = (value: unknown): value is string => typeof value === 'string' && DAY.test(value);

const FIELDS: Record<keyof ItemFields, (value: unknown) => boolean> = {
  name: (v) => typeof v === 'string' && v.length <= MAX_NAME,
  iconId: (v) => v === null || (typeof v === 'string' && v.length > 0 && v.length <= 200),
  purchasePrice: isMoney,
  currency: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
  purchaseDate: isDay,
  endDate: (v) => v === null || isDay(v),
  salePrice: (v) => v === null || isMoney(v),
  note: (v) => typeof v === 'string' && v.length <= MAX_NOTE,
};

/** Every field, each of the right shape, nothing else; null otherwise. */
function readItem(value: unknown): ItemFields | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== Object.keys(FIELDS).length) return null;
  for (const key of keys) {
    const check = Object.prototype.hasOwnProperty.call(FIELDS, key)
      ? FIELDS[key as keyof ItemFields]
      : undefined;
    if (!check || !check(value[key])) return null;
  }
  return value as ItemFields;
}

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op } = raw;
  const keys = Object.keys(raw).sort().join(',');
  if (op === 'create') {
    if (keys !== 'entity,item,op') return null;
    const item = readItem(raw.item);
    return item ? { entity: 'module:item', op, item } : null;
  }
  if (op === 'update') {
    if (keys !== 'at,entity,id,item,op' || !isId(raw.id) || !isAt(raw.at)) return null;
    const item = readItem(raw.item);
    return item ? { entity: 'module:item', op, id: raw.id, at: raw.at, item } : null;
  }
  if (op === 'delete') {
    if (keys !== 'at,entity,id,op' || !isId(raw.id) || !isAt(raw.at)) return null;
    return { entity: 'module:item', op, id: raw.id, at: raw.at };
  }
  if (op === 'reorder') {
    const { ids } = raw;
    if (keys !== 'entity,ids,op' || !Array.isArray(ids) || !ids.length || ids.length > 500) {
      return null;
    }
    if (!ids.every(isId) || new Set(ids).size !== ids.length) return null;
    return { entity: 'module:item', op, ids };
  }
  return null;
}

export const itemModule: EditModule = {
  entity: 'module:item',
  read,
  size: (raw) => {
    const op = raw as unknown as ItemOp;
    return op.op === 'reorder' ? op.ids.length : 1;
  },
  plan: (tools, raw, steps) => {
    const op = raw as unknown as ItemOp;
    const extra = tools.extra as ItemExtra | undefined;
    if (!extra) return tools.refuse('invalid');
    const live = extra.items.filter((item) => !item.deletedAt);

    if (op.op === 'reorder') {
      // ItemsScreen's drag: the whole list in its new order, saved by reorderItems.
      if (!tools.claim('items:order')) return tools.refuse('invalid');
      const have = new Set(live.map((item) => item.id));
      if (op.ids.length !== have.size || !op.ids.every((id) => have.has(id))) {
        return tools.refuse('conflict');
      }
      steps.push({
        kind: 'module',
        entity: 'module:item',
        action: 'reorder',
        payload: { ids: op.ids },
      });
      return tools.ok(op.ids.length);
    }

    let current: Item | null = null;
    if (op.op !== 'create') {
      if (!tools.claim(`item:${op.id}`)) return tools.refuse('invalid');
      current = live.find((item) => item.id === op.id) ?? null;
      // Gone on the phone, or changed there since the browser's copy.
      if (!current || current.updatedAt !== op.at) return tools.refuse('conflict');
    }
    if (op.op === 'delete') {
      steps.push({
        kind: 'module',
        entity: 'module:item',
        action: 'delete',
        payload: { id: op.id },
      });
      return tools.ok(1);
    }

    const fields = op.item;
    const name = fields.name.trim();
    // What the editor's Save needs: a name and a price that reads as >= 0.
    if (!name) return tools.refuse('invalid');
    if (!tools.isDayKey(fields.purchaseDate)) return tools.refuse('invalid');
    if (fields.endDate !== null && !tools.isDayKey(fields.endDate)) return tools.refuse('invalid');
    // A sale price only comes with an end date ("I sold it" sits under "Mark as inactive").
    if (fields.salePrice !== null && fields.endDate === null) return tools.refuse('invalid');
    // The currency picker offers the main and added currencies, plus the item's own.
    if (!extra.currencies.includes(fields.currency) && fields.currency !== current?.currency) {
      return tools.refuse('invalid');
    }
    // The web offers the bundled library; an uploaded icon can only be kept.
    if (
      fields.iconId !== null &&
      !extra.isIcon(fields.iconId) &&
      fields.iconId !== current?.iconId
    ) {
      return tools.refuse('invalid');
    }

    if (!current) {
      // ItemsScreen's checkLimit('items', items.length) before the editor opens.
      const made = tools.created.items ?? 0;
      if (!tools.lookup.isPro && live.length + made >= PRO_LIMITS.FREE_MAX_ITEMS) {
        return tools.refuse('pro_required', 'items');
      }
      tools.created.items = made + 1;
    }

    const input = {
      name,
      iconId: fields.iconId,
      purchasePrice: fields.purchasePrice,
      currency: fields.currency,
      purchaseDate: fields.purchaseDate,
      endDate: fields.endDate,
      salePrice: fields.endDate !== null ? fields.salePrice : null,
      note: fields.note.trim() || null,
    };
    steps.push(
      current
        ? {
            kind: 'module',
            entity: 'module:item',
            action: 'update',
            payload: { id: current.id, input },
          }
        : { kind: 'module', entity: 'module:item', action: 'create', payload: { input } },
    );
    return tools.ok(1);
  },
};
