/**
 * Insights pages that share one menu entry and switch between each other with
 * tabs: Breakdown (expense / income) and Trends (expense / income / category /
 * assets). Each member is still its own insight type underneath, so its period,
 * filters, deep links (`money2time://insights?focus=income_trend`) and saved
 * preferences keep working; the group only changes how the pages are reached.
 */

export const INSIGHT_GROUP_MEMBERS = {
  breakdown: ['expense_breakdown', 'income_breakdown'],
  trends: ['expense_trend', 'income_trend', 'category_trend', 'asset_history'],
} as const;

export type InsightGroupId = keyof typeof INSIGHT_GROUP_MEMBERS;
export type GroupedInsightType = (typeof INSIGHT_GROUP_MEMBERS)[InsightGroupId][number];

export const INSIGHT_GROUP_IDS = Object.keys(INSIGHT_GROUP_MEMBERS) as InsightGroupId[];

/** The insights menu, in order: single pages by type, grouped ones by group. */
export const INSIGHT_MENU_ENTRIES = [
  'review',
  'breakdown',
  'savings_rate',
  'budget',
  'trends',
  'expense_sentiment',
] as const;
export type InsightMenuEntry = (typeof INSIGHT_MENU_ENTRIES)[number];

export function isInsightGroupId(value: string): value is InsightGroupId {
  return Object.prototype.hasOwnProperty.call(INSIGHT_GROUP_MEMBERS, value);
}

export function insightGroupOf(insightType: string): InsightGroupId | null {
  for (const groupId of INSIGHT_GROUP_IDS) {
    if ((INSIGHT_GROUP_MEMBERS[groupId] as readonly string[]).includes(insightType)) {
      return groupId;
    }
  }
  return null;
}

/** The menu entry that shows `insightType`: its group, or the type itself. */
export function insightMenuEntryOf(insightType: string): string {
  return insightGroupOf(insightType) ?? insightType;
}

export type LastInsightTypeByGroup = Partial<Record<InsightGroupId, GroupedInsightType>>;

/**
 * The page a group opens on from the menu: the tab last used in it, or its
 * first tab.
 */
export function insightTypeForGroup(
  groupId: InsightGroupId,
  lastByGroup: LastInsightTypeByGroup,
): GroupedInsightType {
  const last = lastByGroup[groupId];
  const members = INSIGHT_GROUP_MEMBERS[groupId] as readonly GroupedInsightType[];
  if (last && members.includes(last)) return last;
  return members[0]!;
}

export function parseLastInsightTypeByGroup(value: unknown): LastInsightTypeByGroup | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const next: LastInsightTypeByGroup = {};
  INSIGHT_GROUP_IDS.forEach((groupId) => {
    const candidate = record[groupId];
    if (
      typeof candidate === 'string' &&
      (INSIGHT_GROUP_MEMBERS[groupId] as readonly string[]).includes(candidate)
    ) {
      next[groupId] = candidate as GroupedInsightType;
    }
  });
  return next;
}
