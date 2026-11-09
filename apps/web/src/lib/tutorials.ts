import type { ClayIconName } from "@/lib/icons.generated";
import {
  TUTORIAL_CATEGORY_IDS,
  TUTORIALS,
  type Tutorial,
  type TutorialCategoryId,
} from "@/lib/tutorials.generated";

export { TUTORIAL_CATEGORY_IDS, TUTORIALS };
export type { Tutorial, TutorialCategoryId, TutorialStep } from "@/lib/tutorials.generated";

/** Custom scheme the app registers. Opens the same tutorial in the app. */
export function tutorialDeepLink(id: string) {
  return `money2time://tutorial?id=${encodeURIComponent(id)}`;
}

/**
 * Where a step's capture lives in `media/`; see `src/lib/media.ts`. The app
 * ships them as WebP and the sync copies them across unchanged.
 */
export function tutorialImagePath(image: string) {
  return `/tutorials/${image}.webp` as const;
}

const BY_ID = new Map(TUTORIALS.map((tutorial) => [tutorial.id, tutorial]));

export function getTutorial(id: string): Tutorial | undefined {
  return BY_ID.get(id);
}

/** The tutorial before and after this one, for the footer links on a detail page. */
export function tutorialNeighbours(id: string) {
  const index = TUTORIALS.findIndex((tutorial) => tutorial.id === id);
  return {
    previous: index > 0 ? TUTORIALS[index - 1] : undefined,
    next: index >= 0 && index < TUTORIALS.length - 1 ? TUTORIALS[index + 1] : undefined,
  };
}

/**
 * Illustration per tutorial, mirroring the app's `TutorialRow`. Kept out of the
 * generated catalog because the catalog is shared verbatim between the two
 * repositories and the icon names are a rendering concern on each side.
 */
export const TUTORIAL_ICON: Record<string, ClayIconName> = {
  "getting-started": "settings/replay",
  "see-prices-in-hours": "settings/hourly-value",
  "find-your-way-around": "nav/home",
  "make-it-yours": "settings/display",
  "log-an-expense": "entry/keypad",
  "the-add-button": "entry/add-square",
  transfers: "money-time/transfer",
  "log-by-voice": "entry/mic",
  "scan-a-receipt": "entry/scan-receipt",
  "find-a-transaction": "ui/search",
  automations: "settings/auto-log",
  "log-from-bank-notifications": "status/auto-review",
  accounts: "settings/accounts",
  categories: "settings/categories",
  recurring: "settings/recurring",
  albums: "settings/albums",
  items: "settings/items",
  "multi-currency": "settings/exchange-rates",
  "financial-month": "ui/calendar",
  budgets: "settings/budget",
  goals: "status/goal-target",
  "split-a-bill": "money-time/split-bill",
  "split-by-item": "entry/split-notes",
  "settle-up": "settings/settle-up",
  reimbursements: "money-time/wallet-in",
  calendar: "money-time/calendar-clock",
  insights: "money-time/donut-chart",
  review: "money-time/chart-up",
  widgets: "entry/press-button",
  backup: "status/cloud-upload",
  "import-data": "settings/statement-import",
  "app-lock": "settings/app-lock",
  "bulk-edit": "entry/settings-sliders",
  "sentiment": "insights/mood-faces",
  "fix-a-balance": "money-time/balance-scale",
  "credit-cards": "money-time/card",
  "loans": "money-time/invoice",
  "notifications": "settings/notifications",
  "update-your-pay": "money-time/chart-up",
};

export const FALLBACK_TUTORIAL_ICON: ClayIconName = "ui/checklist";

export function tutorialIcon(id: string): ClayIconName {
  return TUTORIAL_ICON[id] ?? FALLBACK_TUTORIAL_ICON;
}

const HAYSTACK = new Map(
  TUTORIALS.map((tutorial) => [
    tutorial.id,
    [
      tutorial.title,
      tutorial.summary,
      tutorial.keywords.join(" "),
      tutorial.steps.map((step) => `${step.title} ${step.body}`).join(" "),
    ]
      .join(" ")
      .toLowerCase(),
  ]),
);

/**
 * The three places a query can land, most specific first. The tiers matter:
 * "budget" appears in the `financial-month` tutorial's keywords ("budget
 * period") and in the `budgets` tutorial's title, and without the split the two
 * tie and catalog order decides, which puts the wrong one first.
 */
const TIERS = new Map(
  TUTORIALS.map((tutorial) => [
    tutorial.id,
    [
      tutorial.title.toLowerCase(),
      `${tutorial.summary} ${tutorial.keywords.join(" ")}`.toLowerCase(),
      tutorial.steps
        .map((step) => `${step.title} ${step.body}`)
        .join(" ")
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
 * Same matcher as the app: every word in the query has to appear somewhere in
 * the tutorial, ranked by where. Plain substring rather than fuzzy, so a result
 * is always explainable.
 */
export function searchTutorials(query: string): Tutorial[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return TUTORIALS;

  // Stable sort, so catalog order breaks a tie within a tier.
  return TUTORIALS.filter((tutorial) =>
    terms.every((term) => (HAYSTACK.get(tutorial.id) ?? "").includes(term)),
  ).sort((a, b) => rank(a.id, terms) - rank(b.id, terms));
}

export type TutorialSection = {
  category: TutorialCategoryId;
  tutorials: Tutorial[];
};

export function groupByCategory(tutorials: Tutorial[]): TutorialSection[] {
  return TUTORIAL_CATEGORY_IDS.map((category) => ({
    category,
    tutorials: tutorials.filter((tutorial) => tutorial.category === category),
  })).filter((section) => section.tutorials.length > 0);
}
