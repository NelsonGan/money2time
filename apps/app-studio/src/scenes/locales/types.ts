/**
 * Shared types for the locale registry.
 *
 * Each locale lives in its own module (`<code>.ts`) that default-exports a
 * `LocaleModule`. `index.ts` aggregates them. Phone screenshots are reused
 * from English for every locale that doesn't ship its own screenshot folder,
 * so all numeric / currency / date tokens in the strings below are kept
 * identical to English on purpose — they must match the baked-in pixels.
 */

/** Overlay copy for the phone scene groups. */
export interface PhoneStrings {
  s1:  { h: string; hl: string; sh: string; she: string; price: string; time: string; timeSub: string };
  s2:  { h: string; hl: string; sh: string; she: string; netWorth: string; netWorthLabel: string; checking: string; checkingSub: string; checkingValue: string; savings: string; savingsSub: string; savingsValue: string };
  s3:  { h: string; hl: string; sh: string; she: string; date: string; dateLabel: string; dateNumber: string; transactions: string; amount: string; food: string; shopping: string; transport: string };
  s4:  { h: string; hl: string; sh: string; she: string; home: string; travel: string; food: string; total: string; totalValue: string };
  s5:  { h: string; hl: string; sh: string; she: string; time: string; timeLabel: string; money: string };
  s6:  { h: string; hl: string; sh: string; she: string; healthy: string; income: string; expense: string; saved: string };
  s7:  { h: string; hl: string; sh: string; she: string; saved: string; quick: string; mood: string };
  s8:  { h: string; hl: string; sh: string; she: string; splitBill: string; mood: string; note: string };
  s9:  { h: string; hl: string; sh: string; she: string; rate: string; perHour: string; revealed: string; current: string };
  s10: { h: string; hl: string; sh: string; she: string; total: string; rent: string; gym: string; streaming: string };
  s11: { h: string; hl: string; sh: string; she: string; display: string; hourly: string; categories: string };
  s12: { h: string; hl: string; sh: string; she: string; language: string; currency: string; theme: string };
  s13: { h: string; hl: string; sh: string; she: string; aiPowered: string; oneTap: string; pasteJSON: string };
  s14: { h: string; hl: string; sh: string; she: string; type: string; tap: string; done: string; category: string };
  /** Budgeting. */
  s16: { h: string; hl: string; sh: string; she: string; ring: string; left: string; budgeted: string; unbudgeted: string };
}

/**
 * Feature graphic tagline. `titleB` is rendered as
 * `{pre}<span accent>{hl}</span>{post}` — the accent span highlights `hl`.
 */
export interface FeatureCopy {
  titleA: string;
  titleB: { pre: string; hl: string; post: string };
  sub: string;
}

/**
 * Landing card hero copy. Two supported shapes:
 *  - inline:  one sentence with an inline-highlighted substring
 *  - split:   two stacked lines, the second rendered large + accented
 */
export type LandingCopy =
  | { title: string; highlight: string; subtitle: string }
  | { titleA: string; titleB: string; subtitle: string };

/** Display metadata for the language chip in the toolbar. */
export interface LocaleMeta {
  code: string;
  flag: string;
  label: string;
  /** Optional short badge (e.g. "MY" for the Malaysia variants). */
  badge?: string;
}

export interface LocaleModule {
  meta: LocaleMeta;
  phone: PhoneStrings;
  feature: FeatureCopy;
  landing: LandingCopy;
}
