export type HomeSummaryMetric = 'income' | 'expense' | 'balance';
export type HomeSummarySide = 'left' | 'right';

export interface CalendarPreferencesSnapshot {
  version: number;
  excludedAccountIds: string[];
  excludedIncomeCategoryIds: string[];
  excludedExpenseCategoryIds: string[];
  homeSummaryLeft: HomeSummaryMetric;
  homeSummaryRight: HomeSummaryMetric;
  homeSummaryLeftHidden: boolean;
  homeSummaryRightHidden: boolean;
}

export const CALENDAR_PREFERENCES_VERSION = 3;

export const DEFAULT_HOME_SUMMARY_PREFERENCES: Readonly<{
  left: HomeSummaryMetric;
  right: HomeSummaryMetric;
}> = { left: 'income', right: 'expense' };

function isHomeSummaryMetric(value: unknown): value is HomeSummaryMetric {
  return value === 'income' || value === 'expense' || value === 'balance';
}

function toUniqueStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const next: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    next.push(trimmed);
  });
  return next;
}

export function parseCalendarPreferencesSnapshot(
  rawValue: string | null | undefined,
): Partial<CalendarPreferencesSnapshot> | null {
  if (!rawValue) return null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    return {
      version: typeof record.version === 'number' ? record.version : undefined,
      excludedAccountIds: toUniqueStringList(record.excludedAccountIds),
      excludedIncomeCategoryIds: toUniqueStringList(record.excludedIncomeCategoryIds),
      excludedExpenseCategoryIds: toUniqueStringList(record.excludedExpenseCategoryIds),
      homeSummaryLeft: isHomeSummaryMetric(record.homeSummaryLeft)
        ? record.homeSummaryLeft
        : undefined,
      homeSummaryRight: isHomeSummaryMetric(record.homeSummaryRight)
        ? record.homeSummaryRight
        : undefined,
      homeSummaryLeftHidden:
        typeof record.homeSummaryLeftHidden === 'boolean'
          ? record.homeSummaryLeftHidden
          : undefined,
      homeSummaryRightHidden:
        typeof record.homeSummaryRightHidden === 'boolean'
          ? record.homeSummaryRightHidden
          : undefined,
    };
  } catch {
    return null;
  }
}

export function getHomeSummaryPreferences(rawValue: string | null | undefined): {
  left: HomeSummaryMetric;
  right: HomeSummaryMetric;
} {
  const parsed = parseCalendarPreferencesSnapshot(rawValue);
  return {
    left: parsed?.homeSummaryLeft ?? DEFAULT_HOME_SUMMARY_PREFERENCES.left,
    right: parsed?.homeSummaryRight ?? DEFAULT_HOME_SUMMARY_PREFERENCES.right,
  };
}

export function updateHomeSummaryPreference(
  rawValue: string | null | undefined,
  side: HomeSummarySide,
  metric: HomeSummaryMetric,
): string {
  let record: Record<string, unknown> = {};
  if (rawValue) {
    try {
      const parsed: unknown = JSON.parse(rawValue);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        record = parsed as Record<string, unknown>;
      }
    } catch {
      // A corrupt preference blob is replaced by the requested valid setting.
    }
  }
  return JSON.stringify({
    ...record,
    version: CALENDAR_PREFERENCES_VERSION,
    [side === 'left' ? 'homeSummaryLeft' : 'homeSummaryRight']: metric,
  });
}
