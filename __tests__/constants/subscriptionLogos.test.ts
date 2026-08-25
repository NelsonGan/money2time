import {
  DEFAULT_SUBSCRIPTION_COUNTRY,
  getSubscriptionCountryFlag,
  getSubscriptionLogoMeta,
  getSubscriptionLogosForCountry,
  regionToSubscriptionCountry,
  searchSubscriptionLogos,
  SUBSCRIPTION_LOGO_COUNTRIES,
  SUBSCRIPTION_LOGOS,
  suggestSubscriptionLogo,
} from '~/constants/subscriptionLogos';
import { SUBSCRIPTION_LOGO_SOURCES } from '~/constants/subscriptionLogos.generated';

const stripAccents = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

describe('subscription logo catalog', () => {
  it('ships logos', () => {
    expect(SUBSCRIPTION_LOGOS.length).toBeGreaterThan(0);
    expect(SUBSCRIPTION_LOGO_COUNTRIES.length).toBeGreaterThan(0);
  });

  it('has a unique id per brand, shaped `<country>/<slug>`', () => {
    const ids = SUBSCRIPTION_LOGOS.map((logo) => logo.id);
    expect(new Set(ids).size).toBe(ids.length);
    SUBSCRIPTION_LOGOS.forEach((logo) => {
      expect(logo.id).toBe(`${logo.country}/${logo.slug}`);
      expect(logo.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(logo.name.trim()).not.toBe('');
    });
  });

  it('resolves every registered id to a bundled asset', () => {
    // A metadata entry with no `require` would render an empty tile; the
    // generator is supposed to make that impossible.
    SUBSCRIPTION_LOGOS.forEach((logo) => {
      expect(SUBSCRIPTION_LOGO_SOURCES[logo.id]).toBeDefined();
    });
    expect(Object.keys(SUBSCRIPTION_LOGO_SOURCES).length).toBe(SUBSCRIPTION_LOGOS.length);
  });

  it('lists only countries that actually have logos, and covers every brand', () => {
    const countrySlugs = new Set(SUBSCRIPTION_LOGO_COUNTRIES.map((c) => c.slug));
    SUBSCRIPTION_LOGOS.forEach((logo) => expect(countrySlugs.has(logo.country)).toBe(true));
    SUBSCRIPTION_LOGO_COUNTRIES.forEach((country) => {
      expect(getSubscriptionLogosForCountry(country.slug).length).toBeGreaterThan(0);
    });
  });

  it('opens on a bucket it actually ships', () => {
    expect(getSubscriptionLogosForCountry(DEFAULT_SUBSCRIPTION_COUNTRY).length).toBeGreaterThan(0);
  });

  it('maps a device region to a shipped country, falling back to the default', () => {
    const withRegion = SUBSCRIPTION_LOGO_COUNTRIES.find((c) => c.region);
    expect(withRegion).toBeDefined();
    expect(regionToSubscriptionCountry(withRegion!.region!)).toBe(withRegion!.slug);
    // Case-insensitive, and an unknown region never lands the user on an empty tab.
    expect(regionToSubscriptionCountry(withRegion!.region!.toLowerCase())).toBe(withRegion!.slug);
    expect(regionToSubscriptionCountry('ZZ')).toBe(DEFAULT_SUBSCRIPTION_COUNTRY);
    expect(regionToSubscriptionCountry(null)).toBe(DEFAULT_SUBSCRIPTION_COUNTRY);
  });

  it('gives the global bucket a globe and countries their flag', () => {
    expect(getSubscriptionCountryFlag('global')).toBe('\u{1F310}');
    const us = SUBSCRIPTION_LOGO_COUNTRIES.find((c) => c.region === 'US');
    if (us) expect(getSubscriptionCountryFlag(us.slug)).toBe('\u{1F1FA}\u{1F1F8}');
    expect(getSubscriptionCountryFlag('not-a-country')).toBe('\u{1F3F3}️');
  });

  it('looks a brand up by id', () => {
    const first = SUBSCRIPTION_LOGOS[0];
    expect(getSubscriptionLogoMeta(first.id)).toEqual(first);
    expect(getSubscriptionLogoMeta('nope/nope')).toBeNull();
    expect(getSubscriptionLogoMeta(null)).toBeNull();
  });
});

describe('searchSubscriptionLogos', () => {
  it('returns nothing for an empty or punctuation-only query', () => {
    expect(searchSubscriptionLogos('')).toEqual([]);
    expect(searchSubscriptionLogos('   ')).toEqual([]);
    expect(searchSubscriptionLogos('!!')).toEqual([]);
  });

  it('surfaces a brand by the start of its name', () => {
    const sample = SUBSCRIPTION_LOGOS[0];
    const results = searchSubscriptionLogos(sample.name);
    expect(results.map((logo) => logo.id)).toContain(sample.id);
  });

  it('ranks an exact-name hit first', () => {
    const sample = SUBSCRIPTION_LOGOS[0];
    expect(searchSubscriptionLogos(sample.name)[0].name).toBe(sample.name);
  });

  it('ignores case, accents and punctuation', () => {
    const target =
      SUBSCRIPTION_LOGOS.find((logo) => stripAccents(logo.name) !== logo.name) ??
      SUBSCRIPTION_LOGOS[0];
    expect(
      searchSubscriptionLogos(stripAccents(target.name).toUpperCase()).map((l) => l.id),
    ).toContain(target.id);
  });

  it('searches every country, not just the active bucket', () => {
    const byCountry = new Map<string, (typeof SUBSCRIPTION_LOGOS)[number]>();
    SUBSCRIPTION_LOGOS.forEach((logo) => {
      if (!byCountry.has(logo.country)) byCountry.set(logo.country, logo);
    });
    byCountry.forEach((logo) => {
      expect(searchSubscriptionLogos(logo.name).map((l) => l.id)).toContain(logo.id);
    });
  });
});

describe('suggestSubscriptionLogo', () => {
  it('ignores a name too short to be meaningful', () => {
    expect(suggestSubscriptionLogo('')).toBeNull();
    expect(suggestSubscriptionLogo('a')).toBeNull();
  });

  it('matches a rule named exactly after a service', () => {
    const sample = SUBSCRIPTION_LOGOS[0];
    expect(suggestSubscriptionLogo(sample.name)?.name).toBe(sample.name);
    expect(suggestSubscriptionLogo(sample.name.toUpperCase())?.name).toBe(sample.name);
  });

  it('matches a service name that leads a longer rule name', () => {
    const sample = SUBSCRIPTION_LOGOS[0];
    expect(suggestSubscriptionLogo(`${sample.name} yearly plan`)?.id).toBe(sample.id);
  });

  it('does not guess from a loose substring', () => {
    // The whole point of the narrow matcher: a rule called "Rent" must not
    // inherit a brand that merely contains those letters.
    expect(suggestSubscriptionLogo('zzzz-not-a-brand-zzzz')).toBeNull();
  });
});

describe('suggestSubscriptionLogo ambiguity', () => {
  /** A normalized brand name shared as a prefix by two or more distinct services. */
  function findAmbiguousPrefix(): string | null {
    const byFirstWord = new Map<string, Set<string>>();
    for (const logo of SUBSCRIPTION_LOGOS) {
      const normalized = stripAccents(logo.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const [first, ...rest] = normalized.split(' ');
      if (!first || rest.length === 0) continue;
      const set = byFirstWord.get(first) ?? new Set<string>();
      set.add(logo.id);
      byFirstWord.set(first, set);
    }
    for (const [word, ids] of byFirstWord) {
      if (ids.size < 2) continue;
      // Only ambiguous if no service is named exactly that word.
      const hasExact = SUBSCRIPTION_LOGOS.some(
        (logo) =>
          stripAccents(logo.name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim() === word,
      );
      if (!hasExact) return word;
    }
    return null;
  }

  it('refuses to guess when several brands extend the name', () => {
    const prefix = findAmbiguousPrefix();
    if (!prefix) return; // catalog too small to be ambiguous
    expect(suggestSubscriptionLogo(prefix)).toBeNull();
  });

  it('still resolves an exact name that other brands also extend', () => {
    // e.g. "Amazon Prime" exists alongside "Amazon Music": naming a rule
    // exactly "Amazon Prime" must win outright over the ambiguity guard.
    const withSibling = SUBSCRIPTION_LOGOS.find((logo) => {
      const base = logo.name.toLowerCase();
      return SUBSCRIPTION_LOGOS.some(
        (other) => other.id !== logo.id && other.name.toLowerCase().startsWith(`${base} `),
      );
    });
    if (!withSibling) return;
    expect(suggestSubscriptionLogo(withSibling.name)?.id).toBe(withSibling.id);
  });

  it('prefers the most specific brand when the rule name extends several', () => {
    // "<brand> <suffix>" should match the longest brand that fits, so a rule
    // called "Amazon Prime yearly" is not reduced to a bare "Amazon".
    const pair = SUBSCRIPTION_LOGOS.find((logo) =>
      SUBSCRIPTION_LOGOS.some(
        (other) =>
          other.id !== logo.id &&
          logo.name.toLowerCase().startsWith(`${other.name.toLowerCase()} `),
      ),
    );
    if (!pair) return;
    expect(suggestSubscriptionLogo(`${pair.name} yearly`)?.id).toBe(pair.id);
  });
});
