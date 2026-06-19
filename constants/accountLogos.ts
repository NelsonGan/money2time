import type { ImageSourcePropType } from 'react-native';

import {
  ACCOUNT_LOGO_COUNTRIES,
  ACCOUNT_LOGO_SOURCES,
  ACCOUNT_LOGOS,
  type AccountLogoCountry,
  type AccountLogoMeta,
} from './accountLogos.generated';

export { ACCOUNT_LOGO_COUNTRIES, ACCOUNT_LOGOS, type AccountLogoCountry, type AccountLogoMeta };

/** Country slug used when the device region maps to nothing we ship logos for. */
export const DEFAULT_LOGO_COUNTRY = 'united-states';

const LOGO_BY_ID = new Map<string, AccountLogoMeta>(ACCOUNT_LOGOS.map((logo) => [logo.id, logo]));

const LOGOS_BY_COUNTRY = ACCOUNT_LOGOS.reduce<Map<string, AccountLogoMeta[]>>((map, logo) => {
  const list = map.get(logo.country) ?? [];
  list.push(logo);
  map.set(logo.country, list);
  return map;
}, new Map());

// ISO 3166-1 alpha-2 region code → bundled country slug. Codes we don't ship
// logos for fall back to DEFAULT_LOGO_COUNTRY.
const REGION_TO_COUNTRY: Record<string, string> = {
  US: 'united-states',
  CN: 'china',
  MY: 'malaysia',
  MX: 'mexico',
  ES: 'spain',
  BR: 'brazil',
  PT: 'portugal',
  DE: 'germany',
  FR: 'france',
  IT: 'italy',
  IN: 'india',
  ID: 'indonesia',
  JP: 'japan',
  KR: 'south-korea',
  DK: 'denmark',
  NO: 'norway',
  NL: 'netherlands',
  PL: 'poland',
  RU: 'russia',
  SE: 'sweden',
  TH: 'thailand',
  TR: 'turkey',
  UA: 'ukraine',
  VN: 'vietnam',
  PH: 'philippines',
};

// country slug → flag emoji, derived from the region map (regional-indicator pair).
const COUNTRY_FLAG_BY_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_TO_COUNTRY).map(([region, slug]) => [
    slug,
    region.toUpperCase().replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0))),
  ]),
);

// Slugs without a single region code (e.g. the "Global" bucket of international brands).
const SPECIAL_FLAGS: Record<string, string> = {
  global: '🌐',
};

/** Flag emoji for a shipped country slug (falls back to a generic flag). */
export function getCountryFlag(countrySlug: string): string {
  return SPECIAL_FLAGS[countrySlug] ?? COUNTRY_FLAG_BY_SLUG[countrySlug] ?? '🏳️';
}

export function resolveAccountLogoSource(logoId?: string | null): ImageSourcePropType | null {
  if (!logoId) return null;
  return ACCOUNT_LOGO_SOURCES[logoId] ?? null;
}

export function getAccountLogoMeta(logoId?: string | null): AccountLogoMeta | null {
  if (!logoId) return null;
  return LOGO_BY_ID.get(logoId) ?? null;
}

export function getLogosForCountry(countrySlug: string): AccountLogoMeta[] {
  return LOGOS_BY_COUNTRY.get(countrySlug) ?? [];
}

/** Maps a device region code (e.g. "MY") to a shipped country slug. */
export function regionToCountrySlug(regionCode?: string | null): string {
  if (!regionCode) return DEFAULT_LOGO_COUNTRY;
  return REGION_TO_COUNTRY[regionCode.toUpperCase()] ?? DEFAULT_LOGO_COUNTRY;
}

/**
 * Full-text search across every logo, ignoring any country filter. Matches the
 * brand name and slug. Returns brands ranked by match quality (prefix > word
 * boundary > substring), then alphabetically.
 */
export function searchAccountLogos(query: string): AccountLogoMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { logo: AccountLogoMeta; score: number }[] = [];
  for (const logo of ACCOUNT_LOGOS) {
    const name = logo.name.toLowerCase();
    const slug = logo.slug.toLowerCase();
    let score = -1;
    if (name.startsWith(q) || slug.startsWith(q)) {
      score = 3;
    } else if (name.includes(` ${q}`) || slug.includes(`-${q}`)) {
      score = 2;
    } else if (name.includes(q) || slug.includes(q) || logo.countryName.toLowerCase().includes(q)) {
      score = 1;
    }
    if (score >= 0) scored.push({ logo, score });
  }

  scored.sort((a, b) => b.score - a.score || a.logo.name.localeCompare(b.logo.name));
  return scored.map((entry) => entry.logo);
}
