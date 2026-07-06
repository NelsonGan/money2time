/**
 * Categorical palette shared by the insights charts (breakdown pie, trends)
 * and the budget view, so a category reads in the same hue family everywhere.
 * Assigned by display order, wrapping past twelve entries.
 */
export const CHART_CATEGORY_COLORS = [
  '#E53935', // red
  '#FB8C00', // orange
  '#FDD835', // yellow
  '#43A047', // green
  '#00897B', // teal
  '#00ACC1', // cyan
  '#1E88E5', // blue
  '#3949AB', // indigo
  '#8E24AA', // violet
  '#D81B60', // magenta
  '#6D4C41', // brown
  '#546E7A', // slate
];

export function chartCategoryColor(index: number): string {
  return CHART_CATEGORY_COLORS[index % CHART_CATEGORY_COLORS.length];
}
