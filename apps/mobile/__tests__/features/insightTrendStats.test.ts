import {
  INSIGHT_MENU_ENTRIES,
  insightGroupOf,
  insightMenuEntryOf,
  insightTypeForGroup,
  parseLastInsightTypeByGroup,
  visibleInsightMenuEntries,
} from '~/features/insights/insightGroups';
import {
  compareCategoryTotals,
  percentChange,
  summarizeTrend,
} from '~/features/insights/lib/trendStats';

describe('insight groups', () => {
  it('puts both breakdowns and the four trends behind one menu entry each', () => {
    expect(insightGroupOf('income_breakdown')).toBe('breakdown');
    expect(insightGroupOf('asset_history')).toBe('trends');
    expect(insightGroupOf('category_trend')).toBe('trends');
    expect(insightGroupOf('savings_rate')).toBeNull();
    expect(insightMenuEntryOf('income_trend')).toBe('trends');
    expect(insightMenuEntryOf('budget')).toBe('budget');
    expect(INSIGHT_MENU_ENTRIES).toEqual([
      'review',
      'household',
      'breakdown',
      'savings_rate',
      'budget',
      'trends',
      'expense_sentiment',
    ]);
  });

  it('lists Household only while the open ledger is shared', () => {
    expect(visibleInsightMenuEntries(true)).toContain('household');
    expect(visibleInsightMenuEntries(false)).not.toContain('household');
    expect(visibleInsightMenuEntries(false)).toHaveLength(INSIGHT_MENU_ENTRIES.length - 1);
  });

  it('opens a group on its last tab, or its first', () => {
    expect(insightTypeForGroup('trends', {})).toBe('expense_trend');
    expect(insightTypeForGroup('trends', { trends: 'asset_history' })).toBe('asset_history');
    expect(insightTypeForGroup('breakdown', { breakdown: 'income_breakdown' })).toBe(
      'income_breakdown',
    );
  });

  it('reads saved tabs and drops ones that are not in the group', () => {
    expect(
      parseLastInsightTypeByGroup({ trends: 'income_trend', breakdown: 'expense_trend' }),
    ).toEqual({ trends: 'income_trend' });
    expect(parseLastInsightTypeByGroup('nope')).toBeUndefined();
  });
});

describe('summarizeTrend', () => {
  const buckets = [0, 1120, 2640, 1790, null];

  it('averages active months and ignores empty and future ones', () => {
    const summary = summarizeTrend(buckets, { activeOnly: true });
    expect(summary.total).toBe(5550);
    expect(summary.counted).toBe(3);
    expect(summary.average).toBeCloseTo(1850);
  });

  it('counts every valued bucket for a balance, negatives included', () => {
    const summary = summarizeTrend([-500, 0, null], { activeOnly: false });
    expect(summary.counted).toBe(2);
    expect(summary.average).toBe(-250);
  });

  it('has no average when nothing counts', () => {
    expect(summarizeTrend([0], { activeOnly: true }).average).toBeNull();
  });
});

describe('percentChange', () => {
  it('compares against a positive reference only', () => {
    expect(percentChange(2184.5, 1850)).toBeCloseTo(18.08, 1);
    expect(percentChange(500, 1000)).toBe(-50);
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(100, null)).toBeNull();
  });
});

describe('compareCategoryTotals', () => {
  it('says which category got more, and by how much', () => {
    expect(compareCategoryTotals(6840, 4215)).toEqual({ kind: 'more', percent: 62 });
    expect(compareCategoryTotals(4215, 6840)).toEqual({ kind: 'less', percent: 62 });
    expect(compareCategoryTotals(100, 100)).toEqual({ kind: 'same' });
    expect(compareCategoryTotals(100, 0)).toEqual({ kind: 'only_first' });
    expect(compareCategoryTotals(0, 50)).toEqual({ kind: 'only_second' });
    expect(compareCategoryTotals(0, 0)).toEqual({ kind: 'none' });
  });
});
