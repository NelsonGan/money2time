import { openDatabaseAsync } from 'expo-sqlite';

import { accountGroupsRepository } from '~/lib/repositories/accountGroupsRepository';
import { accountsRepository } from '~/lib/repositories/accountsRepository';
import { categoriesRepository } from '~/lib/repositories/categoriesRepository';
import { recurringRulesRepository } from '~/lib/repositories/recurringRulesRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import { DEFAULT_CATEGORY_EMOJIS } from '~/constants/appDefaults';
import type { AccountType, CategoryType } from '~/types';
import { I18n } from '~/lib/i18n';

interface MMAssetRow {
  id: number;
  uid: string | null;
  name: string | null;
  sortOrder: number | null;
  groupUid: string | null;
  groupId: number | null;
  groupName: string | null;
  isDeleted: number | null;
  isReflect: number | null;
  cardStatementDay: string | null;
  cardDueDay: string | null;
}

interface MMAssetGroupRow {
  id: number;
  uid: string | null;
  name: string | null;
  sortOrder: number | null;
  isDeleted: number | null;
}

interface MMCategoryRow {
  id: number;
  uid: string | null;
  parentUid: string | null;
  name: string | null;
  sortOrder: number | null;
  doType: number | null;
  isDeleted: number | null;
}

interface MMTxRow {
  id: number;
  doType: number | null;
  amount: number | null;
  dateRaw: number | null;
  content: string | null;
  memo: string | null;
  assetUid: string | null;
  assetId: number | null;
  toAssetUid: string | null;
  oppositeAid: number | null;
  categoryUid: string | null;
  categoryId: number | null;
  categoryName: string | null;
  transferUid: string | null;
  assetName: string | null;
  toAssetName: string | null;
}

interface MMRecurringRow {
  id: number;
  uid: string | null;
  doType: number | null;
  amountSub: number | null;
  amountSubText: string | null;
  assetUid: string | null;
  accountId: number | null;
  categoryUid: string | null;
  categoryId: number | null;
  categoryIdLegacy: number | null;
  payee: string | null;
  memo: string | null;
  repeatType: number | null;
  nextDate: number | null;
  endDate: number | null;
  isDeleted: number | null;
}

const LEADING_CATEGORY_EMOJI = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u200D\uFE0F]+(?:\s+)?/u;

export interface MMImportSummary {
  accounts: number;
  categories: number;
  transactions: number;
  transfers: number;
  recurringRules: number;
  skipped: number;
}

function parseFileUri(uri: string) {
  const normalized = decodeURIComponent(uri.replace('file://', ''));
  const parts = normalized.split('/');
  const fileName = parts[parts.length - 1];
  const directory = parts.slice(0, -1).join('/');
  if (!fileName || !directory) {
    throw new Error(I18n.t('errors.invalid_file_path'));
  }
  return { fileName, directory };
}

function toIsoFromMMDate(raw: number | null) {
  if (!raw || !Number.isFinite(raw)) return new Date().toISOString();
  // Money Manager stores dates as seconds since 2001-01-01 00:00:00 UTC.
  const unixMs = Math.round((raw + 978307200) * 1000);
  const date = new Date(unixMs);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function toIsoFromRecurringDate(raw: number | null) {
  if (!raw || !Number.isFinite(raw)) return null;
  if (raw > 1_000_000_000_000) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  if (raw > 1_000_000_000) {
    const date = new Date(raw * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }
  return toIsoFromMMDate(raw);
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function sanitizeCategoryLabel(value: string | null | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  const withoutEmoji = normalized.replace(LEADING_CATEGORY_EMOJI, '').trim();
  return withoutEmoji || normalized;
}

function normalizeSourceKey(value: string | number | null | undefined) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  return normalized.toUpperCase();
}

function categoryTypeFromDoType(doType: number | null): CategoryType | null {
  if (doType === 0) return 'income';
  if (doType === 1) return 'expense';
  return null;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCardDay(value: string | null | undefined): number | null {
  const parsed = Number((value ?? '').trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return null;
  return parsed;
}

function inferAccountType(
  name: string,
  groupName: string | null,
  statementDay: number | null,
  dueDay: number | null,
): AccountType {
  const lower = name.toLowerCase();
  if (lower.includes('credit')) return 'credit';
  const lowerGroup = (groupName ?? '').toLowerCase();
  if (lowerGroup.includes('credit')) return 'credit';

  if (statementDay || dueDay) {
    const isDefaultCyclePlaceholder = statementDay === 1 && dueDay === 1;
    if (!isDefaultCyclePlaceholder) return 'credit';
  }

  return 'debit';
}

function inferTxType(row: MMTxRow): { type: CategoryType; amount: number } | null {
  const rawAmount = Number(row.amount ?? 0);
  const doType = asNumber(row.doType);
  if (!Number.isFinite(rawAmount) || rawAmount === 0) return null;

  if (doType === 0) {
    return { type: 'income', amount: rawAmount };
  }

  if (doType === 1) {
    return { type: 'expense', amount: rawAmount };
  }

  if (doType === 7) {
    return { type: 'income', amount: Math.abs(rawAmount) };
  }

  if (doType === 8) {
    return { type: 'expense', amount: Math.abs(rawAmount) };
  }

  // Ignore unsupported Money Manager transaction types.
  return null;
}

function includeInTotalsFromReflectFlag(value: number | null | undefined) {
  return (asNumber(value) ?? 0) === 0;
}

function buildCategoryKey(type: CategoryType, name: string, parentId: string | null) {
  return `${type}|${name.toLowerCase()}|${parentId ?? 'root'}`;
}

function buildCategoryPathKey(type: CategoryType, parentName: string, childName: string) {
  return `${type}|${parentName.trim().toLowerCase()}|${childName.trim().toLowerCase()}`;
}

function buildCategoryLeafKey(type: CategoryType, leafName: string) {
  return `${type}|${leafName.trim().toLowerCase()}`;
}

function parseCategoryPath(value: string | null | undefined): {
  parentName: string | null;
  leafName: string | null;
} {
  const normalized = normalizeText(value);
  if (!normalized) return { parentName: null, leafName: null };
  const parts = normalized
    .split(/[/>]/)
    .map((part) => sanitizeCategoryLabel(part))
    .filter(Boolean);
  if (parts.length === 0) return { parentName: null, leafName: null };
  if (parts.length === 1) return { parentName: null, leafName: parts[0] ?? null };
  return {
    parentName: parts[parts.length - 2] ?? null,
    leafName: parts[parts.length - 1] ?? null,
  };
}

function makeNote(row: MMTxRow) {
  const memo = normalizeText(row.memo);
  const content = normalizeText(row.content);
  if (memo && content && memo !== content) return `${content} · ${memo}`;
  return memo || content || null;
}

function makeNoteFromParts(content: string | null | undefined, memo: string | null | undefined) {
  const normalizedMemo = normalizeText(memo);
  const normalizedContent = normalizeText(content);
  if (normalizedMemo && normalizedContent && normalizedMemo !== normalizedContent) {
    return `${normalizedContent} · ${normalizedMemo}`;
  }
  return normalizedMemo || normalizedContent || null;
}

function resolveMappedAccountId(
  keyByUid: string | null | undefined,
  keyById: string | number | null | undefined,
  accountIdBySourceKey: Map<string, string>,
): string | null {
  const normalizedUid = normalizeSourceKey(keyByUid);
  if (normalizedUid) {
    const mapped = accountIdBySourceKey.get(normalizedUid);
    if (mapped) return mapped;
  }

  const normalizedId = normalizeSourceKey(keyById);
  if (normalizedId) {
    const mapped = accountIdBySourceKey.get(normalizedId);
    if (mapped) return mapped;
  }

  return null;
}

function randomCategoryEmoji() {
  const index = Math.floor(Math.random() * DEFAULT_CATEGORY_EMOJIS.length);
  return DEFAULT_CATEGORY_EMOJIS[index] ?? '🧾';
}

function recurrencePatternFromRepeatType(
  repeatType: number | null,
): 'daily' | 'weekly' | 'monthly' | 'yearly' {
  switch (repeatType) {
    case 0:
      return 'daily';
    case 2:
      return 'weekly';
    case 3:
      return 'yearly';
    case 1:
    default:
      return 'monthly';
  }
}

export async function importMoneyManagerBackupFromUri(
  uri: string,
  currencySymbol: string,
): Promise<MMImportSummary> {
  const { fileName, directory } = parseFileUri(uri);
  const sourceDb = await openDatabaseAsync(fileName, undefined, directory);

  try {
    const [assetRows, assetGroupRows, categoryRows, txRows, recurringRows] = await Promise.all([
      sourceDb.getAllAsync<MMAssetRow>(
        `SELECT
          a.Z_PK as id,
          a.ZUID as uid,
          a.ZNICNAME as name,
          a.ZORDER as sortOrder,
          a.ZGROUPUID as groupUid,
          a.ZGROUP_ID as groupId,
          COALESCE(g_uid.ZASSETGROUPNAME, g_id.ZASSETGROUPNAME) as groupName,
          a.ZISDEL as isDeleted,
          a.ZISREFLECT as isReflect,
          a.ZCARD_DAYFIN as cardStatementDay,
          a.ZCARD_DAYPAY as cardDueDay
         FROM ZASSET a
         LEFT JOIN ZASSETGROUP g_uid
           ON g_uid.ZUID = a.ZGROUPUID
         LEFT JOIN ZASSETGROUP g_id
           ON g_id.Z_PK = a.ZGROUP_ID
         WHERE
           COALESCE(a.ZISDEL, 0) = 0
           OR EXISTS (
             SELECT 1
             FROM ZINOUTCOME io
             WHERE
               COALESCE(io.ZISDEL, 0) = 0
               AND (
                 CAST(COALESCE(NULLIF(TRIM(io.ZASSETUID), ''), io.ZASSET_ID) AS TEXT) = CAST(COALESCE(NULLIF(TRIM(a.ZUID), ''), a.Z_PK) AS TEXT)
                 OR CAST(COALESCE(NULLIF(TRIM(io.ZTOASSETUID), ''), io.ZOPPOSITEAID) AS TEXT) = CAST(COALESCE(NULLIF(TRIM(a.ZUID), ''), a.Z_PK) AS TEXT)
               )
           )`,
      ),
      sourceDb.getAllAsync<MMAssetGroupRow>(
        `SELECT
          Z_PK as id,
          ZUID as uid,
          ZASSETGROUPNAME as name,
          ZORDER as sortOrder,
          ZISDEL as isDeleted
         FROM ZASSETGROUP`,
      ),
      sourceDb.getAllAsync<MMCategoryRow>(
        `SELECT
          Z_PK as id,
          ZUID as uid,
          ZPUID as parentUid,
          ZNAME as name,
          ZORDER as sortOrder,
          ZDOTYPE as doType,
          ZISDEL as isDeleted
        FROM ZCATEGORY
        ORDER BY ZDOTYPE ASC, ZORDER ASC, Z_PK ASC`,
      ),
      sourceDb.getAllAsync<MMTxRow>(
        `SELECT
          Z_PK as id,
          ZDO_TYPE as doType,
          ZAMOUNT as amount,
          ZDATE as dateRaw,
          ZCONTENT as content,
          ZMEMO as memo,
          ZASSETUID as assetUid,
          ZASSET_ID as assetId,
          ZTOASSETUID as toAssetUid,
          ZOPPOSITEAID as oppositeAid,
          ZCATEGORYUID as categoryUid,
          ZCATEGORY_ID as categoryId,
          ZCATEGORY_NAME as categoryName,
          ZTXUIDTRANS as transferUid,
          (
            SELECT a.ZNICNAME
            FROM ZASSET a
            WHERE CAST(COALESCE(NULLIF(TRIM(io.ZASSETUID), ''), io.ZASSET_ID) AS TEXT)
              = CAST(COALESCE(NULLIF(TRIM(a.ZUID), ''), a.Z_PK) AS TEXT)
            LIMIT 1
          ) as assetName,
          (
            SELECT a.ZNICNAME
            FROM ZASSET a
            WHERE CAST(COALESCE(NULLIF(TRIM(io.ZTOASSETUID), ''), io.ZOPPOSITEAID) AS TEXT)
              = CAST(COALESCE(NULLIF(TRIM(a.ZUID), ''), a.Z_PK) AS TEXT)
            LIMIT 1
          ) as toAssetName
        FROM ZINOUTCOME
        io
        WHERE COALESCE(ZISDEL, 0) = 0
        ORDER BY ZDATE ASC`,
      ),
      sourceDb.getAllAsync<MMRecurringRow>(
        `SELECT
          Z_PK as id,
          ZUID as uid,
          ZDOTYPE as doType,
          ZAMOUNTSUB as amountSub,
          ZAMOUNT_SUB as amountSubText,
          ZASSETUID as assetUid,
          ZACCOUNT_ID as accountId,
          ZCATEGORYUID as categoryUid,
          ZCATEGORY_ID as categoryId,
          ZCATEGORYID as categoryIdLegacy,
          ZPAYEE as payee,
          ZMEMO as memo,
          ZREPEATTYPE as repeatType,
          ZNEXTDATE as nextDate,
          ZENDDATE as endDate,
          ZISDEL as isDeleted
        FROM ZREPEATTRANSACTION`,
      ),
    ]);

    const summary: MMImportSummary = {
      accounts: 0,
      categories: 0,
      transactions: 0,
      transfers: 0,
      recurringRules: 0,
      skipped: 0,
    };

    const accountIdBySourceKey = new Map<string, string>();
    const referencedAccountSourceKeys = new Set<string>();
    txRows.forEach((row) => {
      const sourceKeys = [
        normalizeSourceKey(row.assetUid),
        normalizeSourceKey(row.assetId),
        normalizeSourceKey(row.toAssetUid),
        normalizeSourceKey(row.oppositeAid),
      ];
      sourceKeys.forEach((key) => {
        if (key) referencedAccountSourceKeys.add(key);
      });
    });
    const fallbackAccountIdByName = new Map<string, string>();

    const sortedAssetRows = [...assetRows].sort((a, b) => {
      const aDeleted = (asNumber(a.isDeleted) ?? 0) !== 0 ? 1 : 0;
      const bDeleted = (asNumber(b.isDeleted) ?? 0) !== 0 ? 1 : 0;
      if (aDeleted !== bDeleted) return aDeleted - bDeleted;
      return (asNumber(a.sortOrder) ?? a.id) - (asNumber(b.sortOrder) ?? b.id);
    });
    const referencedGroupUids = new Set<string>();
    const referencedGroupIds = new Set<string>();
    sortedAssetRows.forEach((row) => {
      if ((asNumber(row.isDeleted) ?? 0) !== 0) return;
      const groupUidKey = normalizeSourceKey(row.groupUid);
      const groupIdKey = normalizeSourceKey(row.groupId);
      if (groupUidKey) {
        referencedGroupUids.add(groupUidKey);
      } else if (groupIdKey) {
        referencedGroupIds.add(groupIdKey);
      }
    });
    const assetGroupNameByUid = new Map<string, string>();
    const assetGroupNameById = new Map<string, string>();
    const sortedAssetGroupRows = [...assetGroupRows].sort((a, b) => {
      const aDeleted = (asNumber(a.isDeleted) ?? 0) !== 0 ? 1 : 0;
      const bDeleted = (asNumber(b.isDeleted) ?? 0) !== 0 ? 1 : 0;
      if (aDeleted !== bDeleted) return aDeleted - bDeleted;
      const orderDelta = (asNumber(a.sortOrder) ?? a.id) - (asNumber(b.sortOrder) ?? b.id);
      if (orderDelta !== 0) return orderDelta;
      return a.id - b.id;
    });
    sortedAssetGroupRows.forEach((row) => {
      const name = normalizeText(row.name);
      if (!name) return;
      const uidKey = normalizeSourceKey(row.uid);
      const idKey = normalizeSourceKey(row.id);
      const isDeleted = (asNumber(row.isDeleted) ?? 0) !== 0;
      const isReferenced =
        (uidKey ? referencedGroupUids.has(uidKey) : false) ||
        (idKey ? referencedGroupIds.has(idKey) : false);
      if (isDeleted && !isReferenced) return;

      accountGroupsRepository.create(name, asNumber(row.sortOrder) ?? undefined);
      if (uidKey) assetGroupNameByUid.set(uidKey, name);
      if (idKey) assetGroupNameById.set(idKey, name);
    });

    sortedAssetRows.forEach((row) => {
      const name = normalizeText(row.name);
      if (!name) return;
      const uidKey = normalizeSourceKey(row.uid);
      const idKey = normalizeSourceKey(row.id);
      const isDeleted = (asNumber(row.isDeleted) ?? 0) !== 0;
      const isReferenced =
        (uidKey ? referencedAccountSourceKeys.has(uidKey) : false) ||
        (idKey ? referencedAccountSourceKeys.has(idKey) : false);

      if (isDeleted && !isReferenced) {
        return;
      }

      const creditStatementDay = parseCardDay(row.cardStatementDay);
      const creditDueDay = parseCardDay(row.cardDueDay);
      const deletedAt = isDeleted ? new Date().toISOString() : null;
      const groupName =
        (row.groupUid ? assetGroupNameByUid.get(normalizeSourceKey(row.groupUid) ?? '') : null) ??
        (row.groupId ? assetGroupNameById.get(normalizeSourceKey(row.groupId) ?? '') : null) ??
        (normalizeText(row.groupName) || null);
      const type = inferAccountType(name, groupName, creditStatementDay, creditDueDay);
      const accountId = accountsRepository.create({
        name,
        type,
        accountGroup: groupName,
        sortOrder: asNumber(row.sortOrder) ?? undefined,
        creditStatementDay: type === 'credit' ? creditStatementDay : null,
        creditDueDay: type === 'credit' ? creditDueDay : null,
        currency: currencySymbol,
        icon: '🏦',
        color: '#22917A',
        startingBalance: 0,
        includeInTotals: includeInTotalsFromReflectFlag(row.isReflect),
        deletedAt,
      });
      summary.accounts += 1;

      if (uidKey) accountIdBySourceKey.set(uidKey, accountId);
      if (idKey) accountIdBySourceKey.set(idKey, accountId);
    });

    const ensureImportedAccount = (
      keyByUid: string | null | undefined,
      keyById: string | number | null | undefined,
      accountNameHint: string | null | undefined,
    ): string | null => {
      const resolved = resolveMappedAccountId(keyByUid, keyById, accountIdBySourceKey);
      if (resolved) return resolved;

      const normalizedName = normalizeText(accountNameHint);
      const fallbackSourceKey = normalizeSourceKey(keyByUid) ?? normalizeSourceKey(keyById);
      const fallbackName =
        normalizedName || (fallbackSourceKey ? `Imported ${fallbackSourceKey}` : '');
      if (!fallbackName) return null;

      const nameKey = fallbackName.toLowerCase();
      if (!fallbackSourceKey) {
        const existingByName = fallbackAccountIdByName.get(nameKey);
        if (existingByName) {
          return existingByName;
        }
      }

      const createdId = accountsRepository.create({
        name: fallbackSourceKey
          ? `${fallbackName} (${fallbackSourceKey.slice(0, 4)})`
          : fallbackName,
        type: inferAccountType(fallbackName, null, null, null),
        accountGroup: null,
        currency: currencySymbol,
        icon: '🏦',
        color: '#22917A',
        startingBalance: 0,
        includeInTotals: true,
      });
      if (!fallbackSourceKey) {
        fallbackAccountIdByName.set(nameKey, createdId);
      }
      if (fallbackSourceKey) accountIdBySourceKey.set(fallbackSourceKey, createdId);
      const sourceUid = normalizeSourceKey(keyByUid);
      const sourceId = normalizeSourceKey(keyById);
      if (sourceUid) accountIdBySourceKey.set(sourceUid, createdId);
      if (sourceId) accountIdBySourceKey.set(sourceId, createdId);
      summary.accounts += 1;
      return createdId;
    };

    const existingCategories = categoriesRepository.list();
    const existingCategoryKeyToId = new Map(
      existingCategories.map((category) => [
        buildCategoryKey(category.type, category.name, category.parentId),
        category.id,
      ]),
    );
    const existingCategoryById = new Map(
      existingCategories.map((category) => [category.id, category]),
    );
    const categoryIconById = new Map(
      existingCategories.map((category) => [category.id, category.icon]),
    );

    const categoryIdByUid = new Map<string, string>();
    const categoryIdByIdKey = new Map<string, string>();
    const activeCategoryIdByLeafAndType = new Map<string, string>();
    const activeCategoryIdByPathAndType = new Map<string, string>();
    const categoryMetaById = new Map<
      string,
      { parentId: string | null; type: CategoryType; name: string; isDeleted: boolean }
    >();
    const mmCategories = categoryRows
      .map((row) => {
        const name = sanitizeCategoryLabel(row.name);
        const type = categoryTypeFromDoType(asNumber(row.doType));
        if (!name || !type) return null;
        const parentUid = normalizeSourceKey(row.parentUid);
        const uid = normalizeSourceKey(row.uid);
        const idKey = normalizeSourceKey(row.id);
        const sourceKey = uid ?? idKey;
        if (!sourceKey || !idKey) return null;
        return {
          id: row.id,
          sourceKey,
          idKey,
          parentSourceKey: parentUid && parentUid !== '0' ? parentUid : null,
          name,
          type,
          isDeleted: (asNumber(row.isDeleted) ?? 0) !== 0,
          sortOrder: asNumber(row.sortOrder) ?? row.id,
        };
      })
      .filter(
        (
          row,
        ): row is {
          id: number;
          sourceKey: string;
          idKey: string;
          parentSourceKey: string | null;
          name: string;
          type: CategoryType;
          isDeleted: boolean;
          sortOrder: number;
        } => !!row,
      )
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
        const sortDelta = a.sortOrder - b.sortOrder;
        if (sortDelta !== 0) return sortDelta;
        return a.id - b.id;
      })
      .map((row) => row);
    let incomeSortIndex = 0;
    let expenseSortIndex = 0;
    const mmCategoriesWithImportOrder = mmCategories.map((row) => ({
      ...row,
      importSortOrder: row.type === 'income' ? incomeSortIndex++ : expenseSortIndex++,
    }));

    const mmCategoryByUid = new Map<string, (typeof mmCategoriesWithImportOrder)[number]>();
    const mmCategoryByIdKey = new Map<string, (typeof mmCategoriesWithImportOrder)[number]>();
    mmCategoriesWithImportOrder.forEach((row) => {
      if (row.sourceKey !== row.idKey) {
        mmCategoryByUid.set(row.sourceKey, row);
      }
      mmCategoryByIdKey.set(row.idKey, row);
    });

    const parentRows = mmCategoriesWithImportOrder.filter((row) => !row.parentSourceKey);
    const childRows = mmCategoriesWithImportOrder.filter((row) => !!row.parentSourceKey);

    const mapActiveCategoryNames = (
      id: string,
      rowType: CategoryType,
      rowName: string,
      parentName: string | null,
    ) => {
      const leafKey = buildCategoryLeafKey(rowType, rowName);
      if (!activeCategoryIdByLeafAndType.has(leafKey)) {
        activeCategoryIdByLeafAndType.set(leafKey, id);
      }
      if (parentName) {
        activeCategoryIdByPathAndType.set(buildCategoryPathKey(rowType, parentName, rowName), id);
      }
    };

    const ensureCategory = (
      row: {
        id: number;
        sourceKey: string;
        idKey: string;
        parentSourceKey: string | null;
        name: string;
        type: CategoryType;
        isDeleted: boolean;
        sortOrder: number;
        importSortOrder: number;
      },
      parentId: string | null,
      parentName: string | null,
      forceInactive = false,
    ) => {
      const isInactive = row.isDeleted || forceInactive;
      const key = buildCategoryKey(row.type, row.name, parentId);
      const existing = existingCategoryKeyToId.get(key);
      if (existing && !isInactive) {
        if (row.sourceKey !== row.idKey) {
          categoryIdByUid.set(row.sourceKey, existing);
        }
        categoryIdByIdKey.set(row.idKey, existing);
        const existingIcon =
          existingCategoryById.get(existing)?.icon ??
          categoryIconById.get(existing) ??
          randomCategoryEmoji();
        categoryIconById.set(existing, existingIcon);
        categoryMetaById.set(existing, {
          parentId,
          type: row.type,
          name: row.name,
          isDeleted: false,
        });
        mapActiveCategoryNames(existing, row.type, row.name, parentName);
        return;
      }

      const now = new Date().toISOString();
      const defaultIcon = parentId ? '' : randomCategoryEmoji();
      const id = categoriesRepository.create({
        name: row.name,
        type: row.type,
        parentId,
        icon: defaultIcon,
        isDefault: false,
        sortOrder: row.importSortOrder,
        deletedAt: isInactive ? now : null,
      });

      if (!isInactive) {
        existingCategoryKeyToId.set(key, id);
      }
      if (row.sourceKey !== row.idKey) {
        categoryIdByUid.set(row.sourceKey, id);
      }
      categoryIdByIdKey.set(row.idKey, id);
      categoryIconById.set(id, defaultIcon);
      categoryMetaById.set(id, { parentId, type: row.type, name: row.name, isDeleted: isInactive });
      if (!isInactive) {
        mapActiveCategoryNames(id, row.type, row.name, parentName);
      }
      summary.categories += 1;
    };

    parentRows.forEach((row) => ensureCategory(row, null, null));
    childRows.forEach((row) => {
      const parentMeta = row.parentSourceKey
        ? (mmCategoryByUid.get(row.parentSourceKey) ??
          mmCategoryByIdKey.get(row.parentSourceKey) ??
          null)
        : null;
      const parentIsInactiveOrMissing =
        !!row.parentSourceKey && (!parentMeta || parentMeta.isDeleted);
      const shouldDropParent = !row.isDeleted && parentIsInactiveOrMissing;
      const parentId = shouldDropParent
        ? null
        : row.parentSourceKey
          ? (categoryIdByUid.get(row.parentSourceKey) ??
            categoryIdByIdKey.get(row.parentSourceKey) ??
            null)
          : null;
      const parentName = shouldDropParent ? null : (parentMeta?.name ?? null);
      ensureCategory(row, parentId, parentName, parentIsInactiveOrMissing);
    });

    const transferRows = txRows.filter((row) => {
      const doType = asNumber(row.doType);
      return doType === 3 || doType === 4;
    });
    const nonTransferRows = txRows.filter((row) => {
      const doType = asNumber(row.doType);
      return doType !== 3 && doType !== 4;
    });

    const resolveNearestActiveAncestor = (categoryId: string | null): string | null => {
      let currentId = categoryId;
      while (currentId) {
        const meta = categoryMetaById.get(currentId);
        if (!meta) return null;
        if (!meta.isDeleted) return currentId;
        currentId = meta.parentId;
      }
      return null;
    };

    nonTransferRows.forEach((row) => {
      const typed = inferTxType(row);
      if (!typed) {
        summary.skipped += 1;
        return;
      }

      const accountId = ensureImportedAccount(row.assetUid, row.assetId, row.assetName);
      const categoryUidKey = normalizeSourceKey(row.categoryUid);
      const categoryIdKey = normalizeSourceKey(row.categoryId);
      const parsedPath = parseCategoryPath(row.categoryName);
      let categoryId =
        (categoryUidKey
          ? (categoryIdByUid.get(categoryUidKey) ?? categoryIdByIdKey.get(categoryUidKey))
          : undefined) ??
        (categoryIdKey
          ? (categoryIdByIdKey.get(categoryIdKey) ?? categoryIdByUid.get(categoryIdKey))
          : undefined) ??
        (parsedPath.parentName && parsedPath.leafName
          ? activeCategoryIdByPathAndType.get(
              buildCategoryPathKey(typed.type, parsedPath.parentName, parsedPath.leafName),
            )
          : undefined) ??
        (parsedPath.leafName
          ? activeCategoryIdByLeafAndType.get(buildCategoryLeafKey(typed.type, parsedPath.leafName))
          : undefined) ??
        null;

      if (categoryId) {
        categoryId = resolveNearestActiveAncestor(categoryId);
      }
      if (!categoryId) {
        categoryId =
          (parsedPath.parentName && parsedPath.leafName
            ? activeCategoryIdByPathAndType.get(
                buildCategoryPathKey(typed.type, parsedPath.parentName, parsedPath.leafName),
              )
            : null) ??
          (parsedPath.leafName
            ? activeCategoryIdByLeafAndType.get(
                buildCategoryLeafKey(typed.type, parsedPath.leafName),
              )
            : null) ??
          null;
      }

      transactionsRepository.create({
        type: typed.type,
        amount: typed.amount,
        currency: currencySymbol,
        date: toIsoFromMMDate(row.dateRaw),
        accountId,
        categoryId,
        note: makeNote(row),
      });
      summary.transactions += 1;
    });

    const transferByUid = new Map<string, MMTxRow>();
    transferRows.forEach((row) => {
      const transferUid = normalizeText(row.transferUid) || `fallback-${row.id}`;
      const existing = transferByUid.get(transferUid);
      if (!existing) {
        transferByUid.set(transferUid, row);
        return;
      }
      // Prefer the outflow row (doType 3) as canonical.
      if (asNumber(existing.doType) !== 3 && asNumber(row.doType) === 3) {
        transferByUid.set(transferUid, row);
      }
    });

    transferByUid.forEach((row) => {
      const amount = Math.abs(Number(row.amount ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) {
        summary.skipped += 1;
        return;
      }

      const fromAccountId = ensureImportedAccount(row.assetUid, row.assetId, row.assetName);
      const toAccountId = ensureImportedAccount(row.toAssetUid, row.oppositeAid, row.toAssetName);

      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
        summary.skipped += 1;
        return;
      }

      transactionsRepository.create({
        type: 'transfer',
        amount,
        currency: currencySymbol,
        date: toIsoFromMMDate(row.dateRaw),
        fromAccountId,
        toAccountId,
        note: makeNote(row),
      });
      summary.transfers += 1;
    });

    recurringRows.forEach((row) => {
      if ((asNumber(row.isDeleted) ?? 0) !== 0) return;
      const doType = asNumber(row.doType);
      if (doType !== 0 && doType !== 1) {
        summary.skipped += 1;
        return;
      }

      const amount = Number(row.amountSub ?? row.amountSubText ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        summary.skipped += 1;
        return;
      }

      const accountId = ensureImportedAccount(row.assetUid, row.accountId, null);
      if (!accountId) {
        summary.skipped += 1;
        return;
      }

      const categoryUidKey = normalizeSourceKey(row.categoryUid);
      const categoryIdKey =
        normalizeSourceKey(row.categoryId) ?? normalizeSourceKey(row.categoryIdLegacy);
      let categoryId =
        (categoryUidKey
          ? (categoryIdByUid.get(categoryUidKey) ?? categoryIdByIdKey.get(categoryUidKey))
          : undefined) ??
        (categoryIdKey
          ? (categoryIdByIdKey.get(categoryIdKey) ?? categoryIdByUid.get(categoryIdKey))
          : undefined) ??
        null;
      if (categoryId) {
        categoryId = resolveNearestActiveAncestor(categoryId);
      }
      if (!categoryId) {
        summary.skipped += 1;
        return;
      }

      const nextRunDate = toIsoFromRecurringDate(row.nextDate);
      if (!nextRunDate) {
        summary.skipped += 1;
        return;
      }
      const endDateRaw = toIsoFromRecurringDate(row.endDate);
      const endDate = endDateRaw && row.endDate && row.endDate > 0 ? endDateRaw : null;
      const note = makeNoteFromParts(row.payee, row.memo);

      recurringRulesRepository.create({
        name:
          normalizeText(row.payee) ||
          normalizeText(row.memo) ||
          I18n.t('errors.recurring_fallback_name', { id: row.id }),
        type: doType === 0 ? 'income' : 'expense',
        amount,
        currency: currencySymbol,
        accountId,
        categoryId,
        note,
        recurrencePattern: recurrencePatternFromRepeatType(asNumber(row.repeatType)),
        recurrenceInterval: 1,
        nextRunDate,
        endDate,
        isActive: true,
      });
      summary.recurringRules += 1;
    });

    return summary;
  } finally {
    await sourceDb.closeAsync();
  }
}
