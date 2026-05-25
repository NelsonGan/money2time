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

const REQUIRED_TABLES = ['INOUTCOME', 'ASSETS', 'ZCATEGORY'] as const;

// Money Manager Android stores dates as milliseconds since Unix epoch.
function parseUnixMillis(raw: number | null): string | null {
  if (!Number.isFinite(raw) || (raw ?? 0) <= 0) return null;
  const date = new Date(raw as number);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Transaction dates fall back to "now" on failure to keep the row importable.
function toIsoFromUnixMillisOrNow(raw: number | null) {
  return parseUnixMillis(raw) ?? new Date().toISOString();
}

interface AndroidTxSourceRow extends Omit<MMTxRow, 'dateIso' | 'amount'> {
  dateRaw: string | null;
  amountRaw: string | null;
}

interface AndroidRecurringSourceRow extends Omit<MMRecurringRow, 'nextDateIso' | 'endDateIso'> {
  nextDate: number | null;
  endDate: number | null;
}

export const androidAdapter: MMBackupAdapter = {
  canHandle(tableNames) {
    return REQUIRED_TABLES.every((table) => tableNames.has(table));
  },

  async extract(db: MMSourceDatabase): Promise<MMBackupData> {
    const [assetRows, assetGroupRows, categoryRows, txSourceRows, recurringSourceRows] =
      await Promise.all([
        db.getAllAsync<MMAssetRow>(
          // Android column mapping (verified against a matched iOS+Android
          // backup pair):
          //   ASSETS.ZDATA  == iOS ZISDEL      (0 = active, 1/2 = deleted)
          //   ASSETS.ZDATA2 == iOS ZISREFLECT  (0 = include in totals, 1 = exclude)
          // The shared writer handles "deleted + unreferenced → drop" once
          // isDeleted is populated correctly.
          `SELECT
            a.ID as id,
            a.uid as uid,
            a.NIC_NAME as name,
            a.ORDERSEQ as sortOrder,
            a.groupUid as groupUid,
            NULL as groupId,
            g.ACC_GROUP_NAME as groupName,
            a.ZDATA as isDeleted,
            a.ZDATA2 as isReflect,
            a.CARD_DAY_FIN as cardStatementDay,
            a.CARD_DAY_PAY as cardDueDay
           FROM ASSETS a
           LEFT JOIN ASSETGROUP g
             ON g.uid = a.groupUid
           WHERE
             COALESCE(CAST(a.ZDATA AS INTEGER), 0) = 0
             OR EXISTS (
               SELECT 1
               FROM INOUTCOME io
               WHERE COALESCE(io.IS_DEL, 0) = 0
                 AND TRIM(COALESCE(a.uid, '')) != ''
                 AND (
                   TRIM(COALESCE(io.assetUid, '')) = TRIM(a.uid)
                   OR TRIM(COALESCE(io.toAssetUid, '')) = TRIM(a.uid)
                 )
             )`,
        ),
        db.getAllAsync<MMAssetGroupRow>(
          `SELECT
            DEVICE_ID as id,
            uid as uid,
            ACC_GROUP_NAME as name,
            ORDERSEQ as sortOrder,
            IS_DEL as isDeleted
           FROM ASSETGROUP`,
        ),
        db.getAllAsync<MMCategoryRow>(
          `SELECT
            ID as id,
            uid as uid,
            pUid as parentUid,
            NAME as name,
            ORDERSEQ as sortOrder,
            TYPE as doType,
            C_IS_DEL as isDeleted
          FROM ZCATEGORY
          ORDER BY TYPE ASC, ORDERSEQ ASC, ID ASC`,
        ),
        db.getAllAsync<AndroidTxSourceRow>(
          `SELECT
            io.AID as id,
            CAST(io.DO_TYPE AS INTEGER) as doType,
            io.ZMONEY as amountRaw,
            io.ZDATE as dateRaw,
            io.ZCONTENT as content,
            io.ZDATA as memo,
            io.assetUid as assetUid,
            NULL as assetId,
            io.toAssetUid as toAssetUid,
            NULL as oppositeAid,
            io.ctgUid as categoryUid,
            NULL as categoryId,
            io.CATEGORY_NAME as categoryName,
            io.txUidTrans as transferUid,
            io.ASSET_NIC as assetName,
            (
              SELECT a.NIC_NAME
              FROM ASSETS a
              WHERE TRIM(COALESCE(a.uid, '')) = TRIM(COALESCE(io.toAssetUid, ''))
                AND TRIM(COALESCE(io.toAssetUid, '')) != ''
              LIMIT 1
            ) as toAssetName
          FROM INOUTCOME io
          WHERE COALESCE(io.IS_DEL, 0) = 0
          ORDER BY CAST(io.ZDATE AS INTEGER) ASC`,
        ),
        db.getAllAsync<AndroidRecurringSourceRow>(
          `SELECT
            DEVICE_ID as id,
            uid as uid,
            DO_TYPE as doType,
            AMOUNT_SUB as amountSub,
            NULL as amountSubText,
            assetUid as assetUid,
            NULL as accountId,
            ctgUid as categoryUid,
            NULL as categoryId,
            NULL as categoryIdLegacy,
            PAYEE as payee,
            MEMO as memo,
            REPEAT_TYPE as repeatType,
            NEXT_DATE as nextDate,
            END_DATE as endDate,
            IS_DEL as isDeleted
          FROM REPEATTRANSACTION`,
        ),
      ]);

    const txRows: MMTxRow[] = txSourceRows.map((row) => {
      const amountNum = row.amountRaw === null ? null : Number(row.amountRaw);
      const dateMillis = row.dateRaw === null ? null : Number(row.dateRaw);
      return {
        id: row.id,
        doType: row.doType,
        amount: Number.isFinite(amountNum) ? amountNum : null,
        dateIso: toIsoFromUnixMillisOrNow(dateMillis),
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
      };
    });

    const recurringRows: MMRecurringRow[] = recurringSourceRows.map((row) => {
      // `parseUnixMillis` already returns null for raw <= 0, so a zero endDate
      // (Money Manager's "no end" sentinel) correctly maps to null.
      const nextDateIso = parseUnixMillis(row.nextDate);
      const endDateIso = parseUnixMillis(row.endDate);
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
