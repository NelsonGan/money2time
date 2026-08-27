import { DATA_TUTORIALS } from './data';
import { INSIGHTS_TUTORIALS } from './insights';
import { LOGGING_TUTORIALS } from './logging';
import { ORGANISE_TUTORIALS } from './organise';
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
  ...ORGANISE_TUTORIALS,
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

/** Title and summary only. A hit here outranks one that is buried in a step. */
const HEADLINE = new Map(
  TUTORIALS.map((tutorial) => [
    tutorial.id,
    `${tutorial.title} ${tutorial.summary} ${tutorial.keywords.join(' ')}`.toLowerCase(),
  ]),
);

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

  // Stable sort: headline hits first, catalog order within each group.
  return matches.sort((a, b) => {
    const scoreA = terms.every((term) => (HEADLINE.get(a.id) ?? '').includes(term)) ? 0 : 1;
    const scoreB = terms.every((term) => (HEADLINE.get(b.id) ?? '').includes(term)) ? 0 : 1;
    return scoreA - scoreB;
  });
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
