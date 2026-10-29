import {
  budgetLineColor,
  lineFill,
  lineHealthColor,
  linePercentLabel,
} from '~/features/budget/lib/format';
import type { BudgetCategoryProgress } from '~/types';

const colors = { error: 'red', accent: 'amber', success: 'green' } as never;

function line(budgeted: number, spent: number): BudgetCategoryProgress {
  return {
    categoryId: 'c',
    budgeted,
    spent,
    remaining: budgeted - spent,
    usageRatio: budgeted > 0 ? spent / budgeted : 0,
    isOver: spent > budgeted,
    children: [],
  };
}

describe('budget line formatting', () => {
  it('fills the bar by usage, and fully once over', () => {
    expect(lineFill(line(100, 30))).toBeCloseTo(0.3);
    expect(lineFill(line(100, 150))).toBe(1);
    expect(lineFill(line(0, 40))).toBe(1);
    expect(lineFill(line(0, 0))).toBe(0);
  });

  it('never reads 0% for a zero-budget overspend', () => {
    expect(linePercentLabel(line(100, 30))).toBe('30%');
    expect(linePercentLabel(line(0, 40))).toBe('999%+');
    expect(linePercentLabel(line(0, 0))).toBe('0%');
  });

  it('colours health: the fallback while healthy, amber from 80%, red when over', () => {
    expect(lineHealthColor(line(100, 30), colors, 'muted')).toBe('muted');
    expect(lineHealthColor(line(100, 85), colors, 'muted')).toBe('amber');
    expect(lineHealthColor(line(100, 120), colors, 'muted')).toBe('red');
    expect(lineHealthColor(line(0, 40), colors, 'muted')).toBe('red');
  });

  it('keeps warning hues off healthy bars', () => {
    const used = new Set(Array.from({ length: 16 }, (_, i) => budgetLineColor(i).toUpperCase()));
    for (const warning of ['#E53935', '#FB8C00', '#FDD835', '#D81B60']) {
      expect(used.has(warning)).toBe(false);
    }
  });
});
