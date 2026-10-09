import type { openDatabaseAsync } from 'expo-sqlite';

export type MMSourceDatabase = Awaited<ReturnType<typeof openDatabaseAsync>>;

export interface MMAssetRow {
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

export interface MMAssetGroupRow {
  id: number;
  uid: string | null;
  name: string | null;
  sortOrder: number | null;
  isDeleted: number | null;
}

export interface MMCategoryRow {
  id: number;
  uid: string | null;
  parentUid: string | null;
  name: string | null;
  sortOrder: number | null;
  doType: number | null;
  isDeleted: number | null;
}

export interface MMTxRow {
  id: number;
  doType: number | null;
  amount: number | null;
  dateIso: string;
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

export interface MMRecurringRow {
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
  nextDateIso: string | null;
  endDateIso: string | null;
  isDeleted: number | null;
}

export interface MMBackupData {
  assetRows: MMAssetRow[];
  assetGroupRows: MMAssetGroupRow[];
  categoryRows: MMCategoryRow[];
  txRows: MMTxRow[];
  recurringRows: MMRecurringRow[];
}

export interface MMImportSummary {
  accounts: number;
  categories: number;
  transactions: number;
  transfers: number;
  recurringRules: number;
  skipped: number;
}

export interface MMBackupAdapter {
  canHandle(tableNames: Set<string>): boolean;
  extract(db: MMSourceDatabase): Promise<MMBackupData>;
}
