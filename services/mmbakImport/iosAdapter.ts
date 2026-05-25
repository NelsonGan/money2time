import type {
  MMAssetGroupRow,
  MMAssetRow,
  MMBackupAdapter,
  MMBackupData,
  MMCategoryRow,
  MMRecurringRow,
  MMSourceDatabase,
  MMTxRow,
} from './types';

const REQUIRED_TABLES = ['ZINOUTCOME', 'ZASSET', 'ZCATEGORY'] as const;

// Money Manager iOS stores dates as seconds since 2001-01-01 UTC (Apple reference date).
function toIsoFromAppleDate(raw: number | null) {
  if (raw === null || !Number.isFinite(raw)) return new Date().toISOString();
  const unixMs = Math.round((raw + 978307200) * 1000);
  const date = new Date(unixMs);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function toIsoFromRecurringDate(raw: number | null): string | null {
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
  return toIsoFromAppleDate(raw);
}

interface IosTxSourceRow extends Omit<MMTxRow, 'dateIso'> {
  dateRaw: number | null;
}

interface IosRecurringSourceRow extends Omit<MMRecurringRow, 'nextDateIso' | 'endDateIso'> {
  nextDate: number | null;
  endDate: number | null;
}

export const iosAdapter: MMBackupAdapter = {
  canHandle(tableNames) {
    return REQUIRED_TABLES.every((table) => tableNames.has(table));
  },

  async extract(db: MMSourceDatabase): Promise<MMBackupData> {
    const [assetRows, assetGroupRows, categoryRows, txSourceRows, recurringSourceRows] =
      await Promise.all([
        db.getAllAsync<MMAssetRow>(
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
        db.getAllAsync<MMAssetGroupRow>(
          `SELECT
            Z_PK as id,
            ZUID as uid,
            ZASSETGROUPNAME as name,
            ZORDER as sortOrder,
            ZISDEL as isDeleted
           FROM ZASSETGROUP`,
        ),
        db.getAllAsync<MMCategoryRow>(
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
        db.getAllAsync<IosTxSourceRow>(
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
        db.getAllAsync<IosRecurringSourceRow>(
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

    const txRows: MMTxRow[] = txSourceRows.map((row) => ({
      id: row.id,
      doType: row.doType,
      amount: row.amount,
      dateIso: toIsoFromAppleDate(row.dateRaw),
      content: row.content,
      memo: row.memo,
      assetUid: row.assetUid,
      assetId: row.assetId,
      toAssetUid: row.toAssetUid,
      oppositeAid: row.oppositeAid,
      categoryUid: row.categoryUid,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      transferUid: row.transferUid,
      assetName: row.assetName,
      toAssetName: row.toAssetName,
    }));

    const recurringRows: MMRecurringRow[] = recurringSourceRows.map((row) => {
      const nextDateIso = toIsoFromRecurringDate(row.nextDate);
      const endDateIsoRaw = toIsoFromRecurringDate(row.endDate);
      const endDateIso = endDateIsoRaw && row.endDate && row.endDate > 0 ? endDateIsoRaw : null;
      return {
        id: row.id,
        uid: row.uid,
        doType: row.doType,
        amountSub: row.amountSub,
        amountSubText: row.amountSubText,
        assetUid: row.assetUid,
        accountId: row.accountId,
        categoryUid: row.categoryUid,
        categoryId: row.categoryId,
        categoryIdLegacy: row.categoryIdLegacy,
        payee: row.payee,
        memo: row.memo,
        repeatType: row.repeatType,
        nextDateIso,
        endDateIso,
        isDeleted: row.isDeleted,
      };
    });

    return {
      assetRows,
      assetGroupRows,
      categoryRows,
      txRows,
      recurringRows,
    };
  },
};
