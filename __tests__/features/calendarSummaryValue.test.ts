import { formatSummaryAmount, SUMMARY_VALUE_MAX_CHARS } from '~/features/calendar/lib/summaryValue';

describe('formatSummaryAmount', () => {
  const settings = { currencySymbol: 'RM', displayMode: 'money' } as const;

  it('keeps the exact amount when it fits the card', () => {
    // The amounts from the reported Android wrapping bug.
    expect(formatSummaryAmount(11616.67, settings)).toBe('RM11,616.67');
    expect(formatSummaryAmount(12242.42, settings)).toBe('RM12,242.42');
  });

  it('keeps the exact amount right up to the character budget', () => {
    const exact = formatSummaryAmount(1234567.89, settings);
    expect(exact).toBe('RM1,234,567.89');
    expect(exact.length).toBe(SUMMARY_VALUE_MAX_CHARS);
  });

  it('abbreviates once the exact amount would overflow the budget', () => {
    expect(formatSummaryAmount(12345678.9, settings)).toBe('RM12.3M');
    expect(formatSummaryAmount(1234567890, settings)).toBe('RM1.2B');
  });

  it('never returns a string longer than the budget', () => {
    const values = [0, 9.99, 1234.5, 11616.67, 999999.99, 87654321, 9876543210];
    for (const value of values) {
      expect(formatSummaryAmount(value, settings).length).toBeLessThanOrEqual(
        SUMMARY_VALUE_MAX_CHARS,
      );
    }
  });

  it('formats zero without abbreviating', () => {
    expect(formatSummaryAmount(0, settings)).toBe('RM0.00');
  });

  // Month income/expense totals are magnitudes, so a negative is not expected
  // here. If one ever arrives, the minus counts against the budget like any
  // other character rather than being silently dropped.
  it('counts a minus sign against the budget', () => {
    expect(formatSummaryAmount(-11616.67, settings)).toBe('-RM11,616.67');
    expect(formatSummaryAmount(-1234567.89, settings)).toBe('-RM1.2M');
  });

  it('respects a longer currency symbol eating into the budget', () => {
    const longSymbol = { currencySymbol: 'CHF ', displayMode: 'money' } as const;
    expect(formatSummaryAmount(1234567.89, longSymbol)).toBe('CHF 1.2M');
  });
});
