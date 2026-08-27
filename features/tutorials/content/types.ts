/**
 * Tutorial content model.
 *
 * The catalog in `tutorials.ts` is the **single source of truth for both
 * repositories**: `scripts/sync-tutorials-web.mjs` copies it (and the annotated
 * screenshots) into money2time-web, so a tutorial is written once and shows up
 * in the app and on money2time.com. Never hand-edit the generated copy on the
 * web side.
 *
 * Copy lives here in English rather than in `lib/i18n/locales/*`. The catalog is
 * long-form content, not UI chrome: putting it in the locale files would add
 * hundreds of keys to all 23 of them (and again to the website's 32), and the
 * parity test would then police prose. The screen chrome around the content
 * (page title, search placeholder, step counter) does go through I18n.
 */

export type TutorialCategoryId =
  | 'start'
  | 'logging'
  | 'organize'
  | 'plan'
  | 'share'
  | 'insights'
  | 'data';

export const TUTORIAL_CATEGORY_IDS: TutorialCategoryId[] = [
  'start',
  'logging',
  'organize',
  'plan',
  'share',
  'insights',
  'data',
];

export interface TutorialStep {
  /**
   * File name (no extension) under `assets/tutorials/`, produced by
   * `scripts/annotate-tutorials.mjs` from a simulator capture plus the red
   * marker spec in `scripts/data/tutorial-shots.json`. `null` renders an empty
   * frame, for a step that is pure copy or has no capture yet.
   */
  image: string | null;
  /** Short heading, a few words. */
  title: string;
  /** One or two plain sentences saying what to do and why. */
  body: string;
}

export interface Tutorial {
  /** Slug. Used by `money2time://tutorial?id=` and `money2time.com/tutorials/<id>`. */
  id: string;
  category: TutorialCategoryId;
  title: string;
  /** One line for the list row and the web card. */
  summary: string;
  /** Words a user might search for that the copy above does not already contain. */
  keywords: string[];
  /** Set when the feature only exists on one platform, so the row can say so. */
  platform?: 'ios';
  /** Set when the feature needs Pro, so the row can badge it. */
  pro?: boolean;
  steps: TutorialStep[];
}
