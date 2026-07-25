import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  ACCOUNT_LOGO_COUNTRIES,
  ACCOUNT_LOGOS,
  getAccountLogoMeta,
  getCountryFlag,
  getLogosForCountry,
  regionToCountrySlug,
  resolveAccountLogoSource,
  searchAccountLogos,
} from '~/constants/accountLogos';
import { ACCOUNT_LOGO_SOURCES } from '~/constants/accountLogos.generated';

const ASSETS_DIR = path.resolve(__dirname, '../../assets/account-logos');

describe('account logo registry', () => {
  it('has a bundled source for every logo, and no orphan sources', () => {
    for (const logo of ACCOUNT_LOGOS) {
      expect(resolveAccountLogoSource(logo.id)).not.toBeNull();
    }
    expect(Object.keys(ACCOUNT_LOGO_SOURCES).sort()).toEqual(ACCOUNT_LOGOS.map((l) => l.id).sort());
  });

  // Both directions guard registry/asset drift: a regenerate can silently drop a
  // hand-curated PNG the upstream logo set lacks, and a hand-added PNG without a
  // regenerate is dead weight the picker never shows.
  it('has a PNG on disk for every logo', () => {
    const missing = ACCOUNT_LOGOS.filter(
      (logo) => !existsSync(path.join(ASSETS_DIR, logo.country, `${logo.slug}.png`)),
    ).map((logo) => logo.id);
    expect(missing).toEqual([]);
  });

  it('has a registry entry for every PNG on disk', () => {
    const registered = new Set(ACCOUNT_LOGOS.map((l) => l.id));
    const orphans: string[] = [];
    for (const country of readdirSync(ASSETS_DIR, { withFileTypes: true })) {
      if (!country.isDirectory()) continue;
      for (const file of readdirSync(path.join(ASSETS_DIR, country.name))) {
        if (!file.endsWith('.png')) continue;
        const id = `${country.name}/${file.replace(/\.png$/, '')}`;
        if (!registered.has(id)) orphans.push(id);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('uses unique ids of the form <country>/<slug>', () => {
    const ids = ACCOUNT_LOGOS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const logo of ACCOUNT_LOGOS) {
      expect(logo.id).toBe(`${logo.country}/${logo.slug}`);
    }
  });

  it('lists only countries that ship logos, and ships logos only for listed countries', () => {
    const listed = new Set(ACCOUNT_LOGO_COUNTRIES.map((c) => c.slug));
    const withLogos = new Set(ACCOUNT_LOGOS.map((l) => l.country));
    expect([...listed].sort()).toEqual([...withLogos].sort());
    for (const country of ACCOUNT_LOGO_COUNTRIES) {
      expect(getLogosForCountry(country.slug).length).toBeGreaterThan(0);
    }
  });

  it('resolves a flag emoji for every listed country', () => {
    for (const country of ACCOUNT_LOGO_COUNTRIES) {
      expect(getCountryFlag(country.slug)).not.toBe('🏳️');
    }
  });

  describe('Taiwan', () => {
    it('is a shipped country reachable from the TW device region', () => {
      expect(regionToCountrySlug('TW')).toBe('taiwan');
      expect(regionToCountrySlug('tw')).toBe('taiwan');
      expect(getCountryFlag('taiwan')).toBe('🇹🇼');
      expect(ACCOUNT_LOGO_COUNTRIES).toContainEqual({ slug: 'taiwan', name: 'Taiwan' });
    });

    it('ships the major banks, e-wallets and brokerages', () => {
      const slugs = getLogosForCountry('taiwan').map((l) => l.slug);
      expect(slugs).toEqual(
        expect.arrayContaining([
          'ctbc-bank',
          'cathay-united-bank',
          'esun-bank',
          'taishin-bank',
          'fubon-bank',
          'bank-of-taiwan',
          'line-pay',
          'jkopay',
          'easycard',
        ]),
      );
      expect(slugs.length).toBeGreaterThanOrEqual(30);
    });

    it('is searchable by brand name and by country name', () => {
      expect(searchAccountLogos('ctbc').map((l) => l.id)).toContain('taiwan/ctbc-bank');
      expect(searchAccountLogos('taiwan').some((l) => l.country === 'taiwan')).toBe(true);
      expect(getAccountLogoMeta('taiwan/ctbc-bank')?.countryName).toBe('Taiwan');
    });
  });
});
