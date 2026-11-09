import type { BackupFile, BackupTables } from "./types";

type BackupError = "not-json" | "not-backup" | "unsupported-version";

export class BackupParseError extends Error {
  readonly code: BackupError;

  constructor(code: BackupError) {
    super(code);
    this.code = code;
  }
}

/** The app writes versions 1 to 3; anything newer was made by a later app. */
const SUPPORTED_VERSIONS = new Set([1, 2, 3]);
const TABLES: (keyof BackupTables)[] = [
  "accounts",
  "account_groups",
  "categories",
  "transactions",
  "transaction_splits",
  "exchange_rates",
  "recurring_rules",
  "settings",
  "monthly_wage_settings",
  "albums",
  "album_transactions",
  "items",
  "monthly_budgets",
  "monthly_budget_categories",
];

/**
 * Parses the text of a Money₂Time backup. Tables added in later app versions
 * may be missing from older backups; they read as empty, as on restore.
 */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupParseError("not-json");
  }
  return readBackup(data);
}

/** Checks and normalizes a backup already parsed from JSON, as `parseBackup` does. */
export function readBackup(data: unknown): BackupFile {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new BackupParseError("not-backup");
  }
  const record = data as Record<string, unknown>;
  const tables = record.tables as Record<string, unknown> | undefined;
  if (
    !tables ||
    typeof tables !== "object" ||
    !Array.isArray(tables.transactions)
  ) {
    throw new BackupParseError("not-backup");
  }
  // The app restores a backup with no accounts list, as one with none.
  if (!Array.isArray(tables.accounts)) tables.accounts = [];
  // As the app: no version is version 1, and anything but a number is not ours.
  if (record.version != null && typeof record.version !== "number") throw new BackupParseError("unsupported-version");
  const version = typeof record.version === "number" ? record.version : 1;
  if (!SUPPORTED_VERSIONS.has(version)) throw new BackupParseError("unsupported-version");

  // A table the file lacks stays absent rather than becoming `[]`: a missing
  // `exchange_rates` marks a backup from before multi-currency, which the
  // model reads as everything in the main currency. Every reader here treats
  // an absent table as empty.
  const normalized = { ...tables } as BackupTables;
  for (const name of TABLES) {
    const rows = tables[name];
    if (Array.isArray(rows)) {
      (normalized as Record<string, unknown[]>)[name] = rows.filter((row) => row && typeof row === "object");
    }
  }

  return {
    ...record,
    version,
    exportedAt: typeof record.exportedAt === "string" ? record.exportedAt : null,
    userAssets: Array.isArray(record.userAssets)
      ? (record.userAssets as unknown[]).filter(
          (asset): asset is { path: string; base64: string } =>
            !!asset &&
            typeof (asset as { path?: unknown }).path === "string" &&
            typeof (asset as { base64?: unknown }).base64 === "string",
        )
      : [],
    tables: normalized,
  };
}
