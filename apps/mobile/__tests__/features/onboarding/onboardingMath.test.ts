import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import {
  exampleHourlyRate,
  roundSampleAmount,
  sampleAmountForHours,
  sanitizeAmountInput,
} from '~/features/onboarding/lib/onboardingMath';

describe('sanitizeAmountInput', () => {
  it('keeps digits and one decimal point', () => {
    expect(sanitizeAmountInput('4000')).toBe('4000');
    expect(sanitizeAmountInput('12.5')).toBe('12.5');
    expect(sanitizeAmountInput('12.')).toBe('12.');
  });

  it('reads a comma as the decimal point', () => {
    expect(sanitizeAmountInput('12,75')).toBe('12.75');
  });

  it('drops a second point, extra decimals and anything else', () => {
    expect(sanitizeAmountInput('1.2.3')).toBe('1.23');
    expect(sanitizeAmountInput('9.999')).toBe('9.99');
    expect(sanitizeAmountInput('$ 1 000')).toBe('1000');
  });
});

describe('roundSampleAmount', () => {
  it('rounds small prices to halves', () => {
    expect(roundSampleAmount(5.77)).toBe(6);
    expect(roundSampleAmount(4.3)).toBe(4.5);
  });

  it('rounds to whole units under 100 and to fives under 1,000', () => {
    expect(roundSampleAmount(17.31)).toBe(17);
    expect(roundSampleAmount(69.24)).toBe(69);
    expect(roundSampleAmount(342)).toBe(340);
  });

  it('keeps two significant digits for large prices', () => {
    expect(roundSampleAmount(6150)).toBe(6200);
    expect(roundSampleAmount(48_400)).toBe(48_000);
  });

  it('never rounds a price down to nothing', () => {
    expect(roundSampleAmount(0.1)).toBe(0.5);
  });
});

describe('sampleAmountForHours', () => {
  it('prices a sample at the hours it is meant to cost', () => {
    expect(sampleAmountForHours(0.25, 23.08)).toBe(6);
    expect(sampleAmountForHours(3, 2000)).toBe(6000);
  });
});

describe('sanitizeAmountInput with pasted grouping', () => {
  it('reads the last separator as the decimal point when both appear', () => {
    expect(sanitizeAmountInput('1,234.56')).toBe('1234.56');
    expect(sanitizeAmountInput('1.234,56')).toBe('1234.56');
    expect(sanitizeAmountInput('1,234,567.8')).toBe('1234567.8');
  });
});

describe('exampleHourlyRate', () => {
  it('keeps 15 where it reads as an hourly pay', () => {
    expect(exampleHourlyRate('MYR')).toBe(15);
    expect(exampleHourlyRate('USD')).toBe(15);
    expect(exampleHourlyRate('EUR')).toBe(15);
    expect(exampleHourlyRate(undefined)).toBe(15);
  });

  it('scales currencies worth much less per unit', () => {
    expect(exampleHourlyRate('JPY')).toBe(1500);
    expect(exampleHourlyRate('krw')).toBe(15000);
    expect(exampleHourlyRate('VND')).toBe(50000);
  });

  it('prices the welcome examples the way they read at RM15/hr', () => {
    const rate = exampleHourlyRate('MYR');
    expect([0.3, 3, 80].map((hours) => sampleAmountForHours(hours, rate))).toEqual([4.5, 45, 1200]);
  });

  it('gives every app currency a coffee that costs more than one unit', () => {
    for (const { code } of MAJOR_CURRENCIES) {
      expect(sampleAmountForHours(0.25, exampleHourlyRate(code))).toBeGreaterThanOrEqual(3);
    }
  });
});
