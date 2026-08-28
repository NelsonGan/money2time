import type { ImageSourcePropType } from 'react-native';

import {
  SUBSCRIPTION_LOGO_COUNTRIES,
  SUBSCRIPTION_LOGO_DARK_MARKS,
  SUBSCRIPTION_LOGO_SOURCES,
  SUBSCRIPTION_LOGOS,
  type SubscriptionLogoCategory,
  type SubscriptionLogoCountry,
  type SubscriptionLogoMeta,
} from './subscriptionLogos.generated';

export {
  SUBSCRIPTION_LOGO_COUNTRIES,
  SUBSCRIPTION_LOGOS,
  type SubscriptionLogoCategory,
  type SubscriptionLogoCountry,
  type SubscriptionLogoMeta,
};

/**
 * Unlike the bank logos, the picker opens on the cross-border bucket: the
 * services almost every user recognises (Netflix, Spotify, iCloud) live there,
 * so a device region we ship nothing for still lands somewhere useful.
 */
export const DEFAULT_SUBSCRIPTION_COUNTRY = 'global';

const DARK_MARK_IDS = new Set<string>(SUBSCRIPTION_LOGO_DARK_MARKS);

/**
 * Whether this logo's art is a dark mark on transparency, which needs a light
 * plate behind it on the dark surface to be visible at all. Bundled ids only:
 * a user's own upload is rendered as they supplied it.
 */
export function isDarkSubscriptionMark(logoId?: string | null): boolean {
  return !!logoId && DARK_MARK_IDS.has(logoId);
}

const LOGO_BY_ID = new Map<string, SubscriptionLogoMeta>(
  SUBSCRIPTION_LOGOS.map((logo) => [logo.id, logo]),
);

const LOGOS_BY_COUNTRY = SUBSCRIPTION_LOGOS.reduce<Map<string, SubscriptionLogoMeta[]>>(
  (map, logo) => {
    const list = map.get(logo.country) ?? [];
    list.push(logo);
    map.set(logo.country, list);
    return map;
  },
  new Map(),
);

// ISO 3166-1 alpha-2 region code -> country slug, derived from the generated
// country list so adding a country to the catalog needs no edit here.
const REGION_TO_COUNTRY = SUBSCRIPTION_LOGO_COUNTRIES.reduce<Record<string, string>>(
  (map, country) => {
    if (country.region) map[country.region] = country.slug;
    return map;
  },
  {},
);

const FLAG_BY_SLUG = SUBSCRIPTION_LOGO_COUNTRIES.reduce<Record<string, string>>((map, country) => {
  map[country.slug] = country.region
    ? country.region
        .toUpperCase()
        .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    : '🌐';
  return map;
}, {});

/** Flag emoji for a shipped country slug (a globe for the cross-border bucket). */
export function getSubscriptionCountryFlag(countrySlug: string): string {
  return FLAG_BY_SLUG[countrySlug] ?? '🏳️';
}

export function resolveSubscriptionLogoSource(logoId?: string | null): ImageSourcePropType | null {
  if (!logoId) return null;
  return SUBSCRIPTION_LOGO_SOURCES[logoId] ?? null;
}

export function getSubscriptionLogoMeta(logoId?: string | null): SubscriptionLogoMeta | null {
  if (!logoId) return null;
  return LOGO_BY_ID.get(logoId) ?? null;
}

export function getSubscriptionLogosForCountry(countrySlug: string): SubscriptionLogoMeta[] {
  return LOGOS_BY_COUNTRY.get(countrySlug) ?? [];
}

/** Maps a device region code (e.g. "MY") to a shipped country slug. */
export function regionToSubscriptionCountry(regionCode?: string | null): string {
  if (!regionCode) return DEFAULT_SUBSCRIPTION_COUNTRY;
  return REGION_TO_COUNTRY[regionCode.toUpperCase()] ?? DEFAULT_SUBSCRIPTION_COUNTRY;
}

/**
 * Comparison key: case-folded, accent-stripped, punctuation-free.
 *
 * Everything outside ASCII is deliberately kept. The catalog is worldwide, so
 * dropping non-Latin characters would normalize names like "Кинопоиск" and
 * "哔哩哔哩" to the empty string and make ~40 brands unsearchable by their own
 * name. Only ASCII punctuation is stripped; a `\p{L}` class would be tidier but
 * a regex that fails to compile takes the whole module down on device, and this
 * range does the same job.
 */
function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0080-\uffff]+/g, ' ')
    .trim();
}

interface SearchEntry {
  logo: SubscriptionLogoMeta;
  name: string;
  slug: string;
  countryName: string;
}

// Built on first use rather than at import time: the catalog is ~2000 brands,
// and this module is pulled in by the recurring editor, which most launches
// never open.
let searchIndex: SearchEntry[] | null = null;

function getSearchIndex(): SearchEntry[] {
  if (!searchIndex) {
    searchIndex = SUBSCRIPTION_LOGOS.map((logo) => ({
      logo,
      name: normalizeForMatch(logo.name),
      slug: normalizeForMatch(logo.slug),
      countryName: normalizeForMatch(logo.countryName),
    }));
  }
  return searchIndex;
}

/** Global services outrank country ones, then alphabetical. */
function compareAtEqualScore(a: SubscriptionLogoMeta, b: SubscriptionLogoMeta): number {
  return (
    Number(b.country === 'global') - Number(a.country === 'global') || a.name.localeCompare(b.name)
  );
}

/**
 * Full-text search across every service, ignoring any country filter. Matches
 * the brand name and slug, ranked by match quality (prefix > word boundary >
 * substring) and then alphabetically. Global services outrank country ones at
 * equal quality, since a search for "prime" should surface Prime Video before
 * a regional namesake.
 */
export function searchSubscriptionLogos(query: string): SubscriptionLogoMeta[] {
  const q = normalizeForMatch(query);
  if (!q) return [];

  const scored: { logo: SubscriptionLogoMeta; score: number }[] = [];
  for (const entry of getSearchIndex()) {
    let score = -1;
    if (entry.name.startsWith(q) || entry.slug.startsWith(q)) {
      score = 3;
    } else if (entry.name.includes(` ${q}`) || entry.slug.includes(` ${q}`)) {
      score = 2;
    } else if (entry.name.includes(q) || entry.slug.includes(q) || entry.countryName.includes(q)) {
      score = 1;
    }
    if (score >= 0) scored.push({ logo: entry.logo, score });
  }

  scored.sort((a, b) => b.score - a.score || compareAtEqualScore(a.logo, b.logo));
  return scored.map((entry) => entry.logo);
}

/**
 * Best-effort logo for a rule the user has just named ("Netflix", "netflix
 * premium"). Deliberately narrow, because this writes a logo the user never
 * explicitly chose onto their rule, and a wrong brand is worse than none:
 *
 *  - an exact name/slug hit always wins ("Disney+" from "disney");
 *  - a rule name that *extends* a brand takes the longest brand that fits, so
 *    "amazon prime yearly" prefers Amazon Prime over a bare "Amazon";
 *  - a rule name that a brand extends only counts when exactly one brand
 *    extends it — otherwise "Apple" would silently pick one of Apple Music,
 *    Apple TV+, Apple Arcade and Apple Fitness+ at random.
 */
export function suggestSubscriptionLogo(ruleName: string): SubscriptionLogoMeta | null {
  const q = normalizeForMatch(ruleName);
  if (q.length < 2) return null;

  const exact: SubscriptionLogoMeta[] = [];
  const ruleExtendsBrand: SearchEntry[] = [];
  const brandExtendsRule: SubscriptionLogoMeta[] = [];

  for (const entry of getSearchIndex()) {
    if (entry.name === q || entry.slug === q) {
      exact.push(entry.logo);
    } else if (q.startsWith(`${entry.name} `) || q.startsWith(`${entry.slug} `)) {
      ruleExtendsBrand.push(entry);
    } else if (entry.name.startsWith(`${q} `)) {
      brandExtendsRule.push(entry.logo);
    }
  }

  if (exact.length) return [...exact].sort(compareAtEqualScore)[0];

  if (ruleExtendsBrand.length) {
    // Longest matching brand first: the most specific reading of the name.
    const best = [...ruleExtendsBrand].sort(
      (a, b) => b.name.length - a.name.length || compareAtEqualScore(a.logo, b.logo),
    );
    return best[0].logo;
  }

  // Ambiguous expansions are dropped rather than guessed at.
  const distinct = new Set(brandExtendsRule.map((logo) => logo.id));
  if (distinct.size === 1) return brandExtendsRule[0];
  return null;
}
