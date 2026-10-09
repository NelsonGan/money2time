/** Locale catalogue plural convention. */
export function countKey(base: string, count: number): string {
  return count === 1 ? `${base}_one` : `${base}_other`;
}
