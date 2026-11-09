/** Editor choices mirror the app; the phone still receives only its four stored patterns. */
export type RepeatingPattern = "daily" | "weekly" | "monthly" | "yearly";
export type RecurrenceFrequency = RepeatingPattern | "quarterly" | "semiannually";

export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = ["daily", "weekly", "monthly", "quarterly", "semiannually", "yearly"];

export function isRepeatingPattern(value: string): value is RepeatingPattern {
  return value === "daily" || value === "weekly" || value === "monthly" || value === "yearly";
}

function multiplier(frequency: RecurrenceFrequency): number {
  return frequency === "quarterly" ? 3 : frequency === "semiannually" ? 6 : 1;
}

/** The edit protocol caps the stored interval, after scaling, at 999. */
export function maxRecurrenceInterval(frequency: RecurrenceFrequency): number {
  return Math.floor(999 / multiplier(frequency));
}

export function storedRecurrenceOf(frequency: RecurrenceFrequency, interval: number): { pattern: RepeatingPattern; interval: number } {
  return {
    pattern: frequency === "quarterly" || frequency === "semiannually" ? "monthly" : frequency,
    interval: interval * multiplier(frequency),
  };
}

export function recurrenceFrequencyOf(pattern: RepeatingPattern, interval: number): { frequency: RecurrenceFrequency; interval: number } {
  if (pattern === "monthly" && interval === 3) return { frequency: "quarterly", interval: 1 };
  if (pattern === "monthly" && interval === 6) return { frequency: "semiannually", interval: 1 };
  return { frequency: pattern, interval };
}
