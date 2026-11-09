/*
 * The two logo libraries the editors browse, the account logos and the
 * subscription logos of recurring rules, as the app's pickers read them: each
 * logo under its country with the app's display name, a search ranked like the
 * app's (constants/subscriptionLogos.ts there), and the country this browser
 * is in to start from.
 */

/** A logo of a catalogue, read from its id ("country/brand"). */
export type LogoEntry = { id: string; country: string; name: string; key: string; slug: string };

/** Case-folded, accent-stripped, punctuation-free, as the app compares names; letters outside ASCII stay. */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0080-\uffff]+/g, " ")
    .trim();
}

/** "banco-do-brasil" → "Banco Do Brasil", for a logo or country the name lists miss. */
export function titleOf(slug: string): string {
  return slug
    .split("-")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** A catalogue's entries, named as the app names them. */
export function logoCatalog(ids: Iterable<string>, names: Readonly<Record<string, string>>): LogoEntry[] {
  return [...ids].map((id) => {
    const [country, brand = ""] = id.split("/");
    const name = names[id] ?? titleOf(brand);
    return { id, country, name, key: normalize(name), slug: normalize(brand) };
  });
}

/** Global services first at equal match, then alphabetical. */
export const byGlobal = (a: LogoEntry, b: LogoEntry) => Number(b.country === "global") - Number(a.country === "global") || a.name.localeCompare(b.name);

/**
 * Search across every logo of a catalogue, whatever country is browsed, ranked
 * as the app's: a name or slug that starts with it, then one with a word that
 * does, then one that has it anywhere (or a country named so).
 */
export function searchLogos(catalog: LogoEntry[], query: string, countries: readonly { slug: string; name: string }[]): LogoEntry[] {
  const q = normalize(query);
  if (!q) return [];
  const countryKeys = new Map(countries.map((country) => [country.slug, normalize(country.name)]));
  const scored: { entry: LogoEntry; score: number }[] = [];
  for (const entry of catalog) {
    const score =
      entry.key.startsWith(q) || entry.slug.startsWith(q)
        ? 3
        : entry.key.includes(` ${q}`) || entry.slug.includes(` ${q}`)
          ? 2
          : entry.key.includes(q) || entry.slug.includes(q) || (countryKeys.get(entry.country) ?? normalize(entry.country)).includes(q)
            ? 1
            : -1;
    if (score >= 0) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score || byGlobal(a.entry, b.entry)).map((item) => item.entry);
}

/** Region code of each catalogue country, for its name in this browser's language and for where to start. */
const COUNTRY_REGION: Record<string, string> = {
  argentina: "AR", australia: "AU", austria: "AT", belgium: "BE", brazil: "BR", canada: "CA", chile: "CL", china: "CN", colombia: "CO",
  czechia: "CZ", denmark: "DK", finland: "FI", france: "FR", germany: "DE", "hong-kong": "HK", india: "IN", indonesia: "ID", ireland: "IE",
  italy: "IT", japan: "JP", malaysia: "MY", mexico: "MX", netherlands: "NL", "new-zealand": "NZ", norway: "NO", philippines: "PH",
  poland: "PL", portugal: "PT", romania: "RO", russia: "RU", "saudi-arabia": "SA", singapore: "SG", "south-africa": "ZA",
  "south-korea": "KR", spain: "ES", sweden: "SE", switzerland: "CH", taiwan: "TW", thailand: "TH", turkey: "TR", ukraine: "UA",
  "united-arab-emirates": "AE", "united-kingdom": "GB", "united-states": "US", vietnam: "VN",
};

/**
 * A catalogue's countries named in this browser's language (the app's English
 * name, or the slug, where the browser has none): global first, then
 * alphabetical.
 */
export function logoCountries(catalog: LogoEntry[], englishNames: readonly { slug: string; name: string }[], locale: string, globalLabel: string): { slug: string; label: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(locale, { type: "region" });
  } catch {
    names = null;
  }
  const english = new Map(englishNames.map((country) => [country.slug, country.name]));
  const label = (slug: string) =>
    slug === "global" ? globalLabel : (COUNTRY_REGION[slug] && names?.of(COUNTRY_REGION[slug])) || english.get(slug) || titleOf(slug);
  return [...new Set(catalog.map((entry) => entry.country))]
    .map((slug) => ({ slug, label: label(slug) }))
    .sort((a, b) => Number(b.slug === "global") - Number(a.slug === "global") || a.label.localeCompare(b.label, locale));
}

/** The catalogue country this browser's region is, as the app starts from the phone's; else `fallback`. */
export function browserCountry(countries: string[], fallback: string): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const match = region ? Object.entries(COUNTRY_REGION).find(([, code]) => code === region)?.[0] : undefined;
    if (match && countries.includes(match)) return match;
  } catch {
    // No region to go on.
  }
  return fallback;
}
