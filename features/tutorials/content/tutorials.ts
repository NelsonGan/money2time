import { DATA_TUTORIALS } from './data';
import { INSIGHTS_TUTORIALS } from './insights';
import { LOGGING_TUTORIALS } from './logging';
import { ORGANIZE_TUTORIALS } from './organize';
import { PLAN_TUTORIALS } from './plan';
import { SHARE_TUTORIALS } from './share';
import { START_TUTORIALS } from './start';
import type { Tutorial, TutorialCategoryId } from './types';
import { TUTORIAL_CATEGORY_IDS } from './types';

/**
 * Every tutorial, in the order the list renders them. `scripts/sync-tutorials-web.mjs`
 * reads this array (and `assets/tutorials/`) to build the website's copy, so the two
 * platforms can never drift.
 */
export const TUTORIALS: Tutorial[] = [
  ...START_TUTORIALS,
  ...LOGGING_TUTORIALS,
  ...ORGANIZE_TUTORIALS,
  ...PLAN_TUTORIALS,
  ...SHARE_TUTORIALS,
  ...INSIGHTS_TUTORIALS,
  ...DATA_TUTORIALS,
];

const BY_ID = new Map(TUTORIALS.map((tutorial) => [tutorial.id, tutorial]));

export function getTutorial(id: string | undefined | null): Tutorial | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** i18n key for a category heading. */
export function tutorialCategoryKey(category: TutorialCategoryId): string {
  return `tutorials.category.${category}`;
}

/**
 * Everything a query is matched against, lowercased once at module load. Step
 * copy is included so "back tap" finds the automation tutorial even though the
 * phrase only appears three screens in.
 */
const HAYSTACK = new Map(
  TUTORIALS.map((tutorial) => [
    tutorial.id,
    [
      tutorial.title,
      tutorial.summary,
      tutorial.keywords.join(' '),
      tutorial.steps.map((step) => `${step.title} ${step.body}`).join(' '),
    ]
      .join(' ')
      .toLowerCase(),
  ]),
);

/**
 * The three places a query can land, most specific first. The tiers matter:
 * "budget" appears in the `financial-month` tutorial's keywords ("budget
 * period") and in the `budgets` tutorial's title, and without the split the
 * two tie and catalog order decides, which puts the wrong one first.
 */
const TIERS = new Map(
  TUTORIALS.map((tutorial) => [
    tutorial.id,
    [
      tutorial.title.toLowerCase(),
      `${tutorial.summary} ${tutorial.keywords.join(' ')}`.toLowerCase(),
      tutorial.steps
        .map((step) => `${step.title} ${step.body}`)
        .join(' ')
        .toLowerCase(),
    ],
  ]),
);

/** Lowest tier index whose text contains every term, or TIERS.length if none does. */
function rank(id: string, terms: string[]): number {
  const tiers = TIERS.get(id) ?? [];
  const index = tiers.findIndex((text) => terms.every((term) => text.includes(term)));
  return index === -1 ? tiers.length : index;
}

/**
 * Substring search over every word in the query, all of which must match. Kept
 * deliberately plain: the catalog is a few dozen entries, so there is nothing
 * to gain from an index, and a fuzzy matcher would surface tutorials the user
 * cannot see why they got.
 */
export function searchTutorials(query: string): Tutorial[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return TUTORIALS;

  const matches = TUTORIALS.filter((tutorial) => {
    const haystack = HAYSTACK.get(tutorial.id) ?? '';
    return terms.every((term) => haystack.includes(term));
  });

  // Stable sort, so catalog order breaks a tie within a tier.
  return matches.sort((a, b) => rank(a.id, terms) - rank(b.id, terms));
}

export interface TutorialSection {
  category: TutorialCategoryId;
  tutorials: Tutorial[];
}

/** Groups a result set into category sections, dropping any that came back empty. */
export function groupByCategory(tutorials: Tutorial[]): TutorialSection[] {
  return TUTORIAL_CATEGORY_IDS.map((category) => ({
    category,
    tutorials: tutorials.filter((tutorial) => tutorial.category === category),
  })).filter((section) => section.tutorials.length > 0);
}

export { TUTORIAL_CATEGORY_IDS };
export type { Tutorial, TutorialCategoryId, TutorialStep } from './types';
