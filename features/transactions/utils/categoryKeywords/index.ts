import { I18n } from '~/lib/i18n';

import type { Category } from '~/types';

import en from './en';
import da from './da';
import de from './de';
import es from './es';
import fil from './fil';
import fr from './fr';
import hi from './hi';
import id from './id';
import it from './it';
import ja from './ja';
import ko from './ko';
import ms from './ms';
import nb from './nb';
import nl from './nl';
import pl from './pl';
import pt from './pt';
import ru from './ru';
import sv from './sv';
import th from './th';
import tr from './tr';
import uk from './uk';
import vi from './vi';

import type { KeywordCategoryKey } from './en';

export type { KeywordCategoryKey } from './en';

const CORE_KEYWORDS = en;

const LOCALE_EXTENSIONS: Partial<Record<string, Partial<Record<KeywordCategoryKey, string[]>>>> = {
  da,
  de,
  es,
  fil,
  fr,
  hi,
  id,
  it,
  ja,
  ko,
  ms,
  nb,
  nl,
  pl,
  pt,
  ru,
  sv,
  th,
  tr,
  uk,
  vi,
};

export const CATEGORY_KEYWORDS: Record<KeywordCategoryKey, string[]> = Object.fromEntries(
  (Object.entries(CORE_KEYWORDS) as Array<[KeywordCategoryKey, string[]]>).map(([key, list]) => [
    key,
    Array.from(new Set(list)),
  ]),
) as Record<KeywordCategoryKey, string[]>;

const CATEGORY_NAME_TO_KEY: Record<string, KeywordCategoryKey[]> = {
  food: ['food'],
  'food & dining': ['food'],
  'food and dining': ['food'],
  dining: ['food'],
  restaurant: ['food'],
  restaurants: ['food'],
  groceries: ['groceries'],
  grocery: ['groceries'],
  transport: ['transport'],
  transportation: ['transport'],
  travel: ['travel'],
  housing: ['housing'],
  rent: ['housing'],
  bills: ['bills'],
  utilities: ['bills'],
  healthcare: ['healthcare'],
  health: ['healthcare'],
  medical: ['healthcare'],
  shopping: ['shopping'],
  entertainment: ['entertainment'],
  education: ['education'],
  pets: ['pets'],
  fitness: ['fitness'],
  'health & fitness': ['fitness', 'healthcare'],
  gifts: ['gifts'],
  donations: ['gifts'],
  salary: ['salary'],
  income: ['salary'],
  wages: ['salary'],
  investment: ['investment'],
  investments: ['investment'],
  refund: ['refund'],
  refunds: ['refund'],
  cashback: ['refund'],
};

const HAS_CJK_PATTERN = /[㐀-鿿豈-﫿]/;

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCjk(text: string) {
  return HAS_CJK_PATTERN.test(text);
}

interface CompiledKeyword {
  keyword: string;
  length: number;
  cjk: boolean;
  pattern: RegExp | null; // only set for Latin keywords
}

function compileKeywordList(list: string[]): CompiledKeyword[] {
  return list
    .map((keyword) => {
      const cjk = isCjk(keyword);
      return {
        keyword,
        length: keyword.length,
        cjk,
        pattern: cjk
          ? null
          : new RegExp(`(?:^|[^a-z0-9])${escapeRegex(keyword.toLowerCase())}(?:[^a-z0-9]|$)`, 'i'),
      };
    })
    .sort((a, b) => b.length - a.length);
}

function compileBuckets(
  keywords: Record<KeywordCategoryKey, string[]>,
): Record<KeywordCategoryKey, CompiledKeyword[]> {
  return Object.fromEntries(
    (Object.entries(keywords) as Array<[KeywordCategoryKey, string[]]>).map(([bucket, list]) => [
      bucket,
      compileKeywordList(list),
    ]),
  ) as Record<KeywordCategoryKey, CompiledKeyword[]>;
}

// Core compiled buckets (EN + ZH + MY/SG + US) — always available.
// Precompile keywords once per bucket so we don't allocate RegExps on every
// match call. The matcher runs ~6,500 keywords across buckets on every quick-
// add categorization — rebuilding regex objects each time costs measurable JS
// thread time on low-end Android.
const COMPILED_BY_BUCKET: Record<KeywordCategoryKey, CompiledKeyword[]> =
  compileBuckets(CATEGORY_KEYWORDS);

// Locale-specific compiled cache — built lazily per locale, kept for the
// lifetime of the app (locale changes are rare).
const localeCompiledCache = new Map<string, Record<KeywordCategoryKey, CompiledKeyword[]>>();

function getCompiledBuckets(locale: string): Record<KeywordCategoryKey, CompiledKeyword[]> {
  const ext = LOCALE_EXTENSIONS[locale];
  if (!ext) return COMPILED_BY_BUCKET; // no extension for this locale → use core
  if (localeCompiledCache.has(locale)) return localeCompiledCache.get(locale)!;

  const merged = Object.fromEntries(
    (Object.entries(CATEGORY_KEYWORDS) as Array<[KeywordCategoryKey, string[]]>).map(([k, v]) => [
      k,
      Array.from(new Set([...v, ...(ext[k] ?? [])])),
    ]),
  ) as Record<KeywordCategoryKey, string[]>;

  const compiled = compileBuckets(merged);
  localeCompiledCache.set(locale, compiled);
  return compiled;
}

function compiledKeywordScore(text: string, textLower: string, compiled: CompiledKeyword): number {
  if (!compiled.keyword) return 0;
  if (compiled.cjk) {
    return text.includes(compiled.keyword) ? compiled.length : 0;
  }
  return compiled.pattern && compiled.pattern.test(textLower) ? compiled.length : 0;
}

// Precompile alias patterns once at module load. `categoryKeyForName` is
// called per user-category during every quick-add categorization
// (via resolveBucketCategoryIds), so allocating ~25 RegExps on each call adds
// up. With this cache, the per-call cost drops to a few `.test()` invocations.
const COMPILED_ALIASES: Array<{ pattern: RegExp; keys: KeywordCategoryKey[] }> = Object.entries(
  CATEGORY_NAME_TO_KEY,
)
  .filter(([aliasName]) => aliasName.length >= 3)
  .map(([aliasName, keys]) => ({
    pattern: new RegExp(`(?:^|[^a-z0-9])${escapeRegex(aliasName)}(?:[^a-z0-9]|$)`, 'i'),
    keys,
  }));

function categoryKeyForName(name: string): KeywordCategoryKey[] {
  const lower = name.trim().toLowerCase();
  if (!lower) return [];
  if (CATEGORY_NAME_TO_KEY[lower]) return CATEGORY_NAME_TO_KEY[lower];

  // Word-boundary alias match — only consider an alias matched if the alias
  // appears as a whole word in the user-provided category name. The old
  // implementation used `includes`, which falsely matched short user category
  // names (e.g. a category named "x" would match every alias containing "x").
  for (const { pattern, keys } of COMPILED_ALIASES) {
    if (pattern.test(lower)) return keys;
  }
  return [];
}

interface MatchResult {
  categoryId: string;
  score: number;
}

/**
 * Resolve which user-category should own each keyword bucket.
 * Priority: user override (categoryMap) → name-based auto-detection.
 * Returns Map<KeywordCategoryKey, categoryId> with only buckets that resolve to
 * a category that exists in the provided candidate list.
 */
export function resolveBucketCategoryIds(
  categories: Category[],
  categoryMap: Partial<Record<string, string>> = {},
): Map<KeywordCategoryKey, string> {
  const candidateIds = new Set(categories.map((c) => c.id));
  const result = new Map<KeywordCategoryKey, string>();
  (Object.keys(CATEGORY_KEYWORDS) as KeywordCategoryKey[]).forEach((bucket) => {
    const override = categoryMap[bucket];
    if (override && candidateIds.has(override)) {
      result.set(bucket, override);
      return;
    }
    // Fall back to name-based auto-detection
    for (const category of categories) {
      const keys = categoryKeyForName(category.name);
      if (keys.includes(bucket)) {
        result.set(bucket, category.id);
        return;
      }
    }
  });
  return result;
}

export function matchCategoryByKeywords(
  text: string,
  categories: Category[],
  categoryMap: Partial<Record<string, string>> = {},
): MatchResult | null {
  const normalized = text.trim();
  if (!normalized) return null;

  const bucketToCategoryId = resolveBucketCategoryIds(categories, categoryMap);
  if (bucketToCategoryId.size === 0) return null;

  const textLower = normalized.toLowerCase();
  let best: MatchResult | null = null;

  const compiledBuckets = getCompiledBuckets(I18n.locale ?? 'en');

  bucketToCategoryId.forEach((categoryId, bucket) => {
    const compiled = compiledBuckets[bucket];
    if (!compiled) return;
    let bestScoreForBucket = 0;
    for (const item of compiled) {
      // Quick prune: if this keyword can't possibly beat what we already have,
      // skip the regex/includes test.
      if (item.length <= bestScoreForBucket) continue;
      const score = compiledKeywordScore(normalized, textLower, item);
      if (score > bestScoreForBucket) bestScoreForBucket = score;
    }
    if (bestScoreForBucket > 0 && (!best || bestScoreForBucket > best.score)) {
      best = { categoryId, score: bestScoreForBucket };
    }
  });

  return best;
}
