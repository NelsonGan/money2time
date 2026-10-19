import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CARD_DESIGN_GENRES,
  CARD_DESIGN_TEMPLATES,
  CUSTOM_CARD_DESIGN_SCRIM,
  customCardDesignFileName,
  customCardDesignTextTone,
  getCardDesignTemplate,
  isCustomCardDesign,
  resolveCardDesignAppearance,
  templatesForGenre,
} from '~/constants/cardDesigns';

const ROOT = resolve(__dirname, '../..');

describe('card design templates', () => {
  it('ships every genre with several designs, and no stray genre', () => {
    for (const genre of CARD_DESIGN_GENRES) {
      expect(templatesForGenre(genre).length).toBeGreaterThanOrEqual(3);
    }
    for (const template of CARD_DESIGN_TEMPLATES) {
      expect(CARD_DESIGN_GENRES).toContain(template.genre);
    }
  });

  it('uses stable kebab-case `<genre>/<name>` ids backed by real files', () => {
    const ids = new Set<string>();
    for (const template of CARD_DESIGN_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z0-9-]+\/[a-z0-9-]+$/);
      expect(template.id.startsWith(`${template.genre}/`)).toBe(true);
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);
      expect(existsSync(resolve(ROOT, 'assets/card-designs', `${template.id}.webp`))).toBe(true);
    }
  });

  it('gives every design a band behind its top row, light enough to keep the art', () => {
    for (const template of CARD_DESIGN_TEMPLATES) {
      expect(['light', 'dark']).toContain(template.textTone);
      expect(template.scrim).toBeGreaterThanOrEqual(0.2);
      expect(template.scrim).toBeLessThanOrEqual(0.8);
    }
  });

  it('has an English label for every genre', () => {
    const en = readFileSync(resolve(ROOT, 'lib/i18n/locales/en.ts'), 'utf8');
    for (const genre of CARD_DESIGN_GENRES) {
      expect(en).toContain(`genre_${genre}:`);
    }
  });
});

describe('card design values', () => {
  it('tells uploads from templates', () => {
    expect(isCustomCardDesign('custom:card-designs/a.text-light.jpg')).toBe(true);
    expect(isCustomCardDesign('marble/black')).toBe(false);
    expect(isCustomCardDesign(null)).toBe(false);
    // Another kind's upload is not a card design.
    expect(isCustomCardDesign('custom:account-logos/a.png')).toBe(false);
  });

  it("round-trips an upload's text colour through its file name", () => {
    expect(customCardDesignFileName('abc', 'dark')).toBe('abc.text-dark.jpg');
    expect(customCardDesignTextTone('custom:card-designs/abc.text-dark.jpg')).toBe('dark');
    expect(customCardDesignTextTone('custom:card-designs/abc.text-light.jpg')).toBe('light');
    // A name without the marker reads as light text, the safer default.
    expect(customCardDesignTextTone('custom:card-designs/abc.jpg')).toBe('light');
  });

  it('resolves a template to its measured appearance', () => {
    const template = CARD_DESIGN_TEMPLATES[0]!;
    expect(resolveCardDesignAppearance(template.id, () => null)).toEqual({
      source: template.source,
      textTone: template.textTone,
      scrim: template.scrim,
    });
    expect(getCardDesignTemplate(template.id)).toBe(template);
  });

  it('resolves an upload to its file with the fixed wash for its text colour', () => {
    const value = 'custom:card-designs/abc.text-dark.jpg';
    expect(resolveCardDesignAppearance(value, () => 'file:///abc.jpg')).toEqual({
      source: { uri: 'file:///abc.jpg' },
      textTone: 'dark',
      scrim: CUSTOM_CARD_DESIGN_SCRIM.dark,
    });
  });

  it('falls back to the plain card for nothing, a missing upload or an unknown id', () => {
    expect(resolveCardDesignAppearance(null, () => null)).toBeNull();
    expect(resolveCardDesignAppearance('', () => null)).toBeNull();
    expect(
      resolveCardDesignAppearance('custom:card-designs/gone.text-light.jpg', () => null),
    ).toBeNull();
    expect(resolveCardDesignAppearance('retired/design', () => null)).toBeNull();
  });
});
