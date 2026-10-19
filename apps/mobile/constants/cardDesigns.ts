import type { ImageSourcePropType } from 'react-native';

import { CARD_DESIGN_TEMPLATES } from './cardDesigns.generated';

/**
 * Artwork behind an account's card on the Accounts screen.
 *
 * `accounts.card_design` holds one tagged string:
 *
 *   null / ''                         the plain colour card (the default)
 *   `<genre>/<name>`                  a bundled template, e.g. `marble/black`
 *   `custom:card-designs/<file>`      a Pro upload, cropped to the card shape
 *
 * An id this build does not know (a template removed later, a restored upload
 * whose file is missing) falls back to the plain card rather than failing.
 */

/** Which text colour sits on the artwork: white ('light') or near-black ('dark'). */
export type CardTextTone = 'light' | 'dark';

/** Template genres in display order. Folder names under assets/card-designs/. */
export const CARD_DESIGN_GENRES = [
  'minimal',
  'gradient',
  'luxury',
  'texture',
  'marble',
  'pattern',
  'nature',
  'space',
  'abstract',
  'anime',
  'retro',
  'cute',
] as const;

export type CardDesignGenre = (typeof CARD_DESIGN_GENRES)[number];

export interface CardDesignTemplate {
  /** `<genre>/<name>`, the value stored on the account. Never rename. */
  id: string;
  genre: CardDesignGenre;
  source: ImageSourcePropType;
  textTone: CardTextTone;
  /**
   * Opacity of the band behind the card's top row (black under light text,
   * white under dark text), measured by the generator from the art's contrast
   * and busyness. The rest of a closed card shows the art unwashed.
   */
  scrim: number;
}

export { CARD_DESIGN_TEMPLATES };

/** Width over height of the card artwork, and of the crop an upload is cut to. */
export const CARD_DESIGN_ASPECT_RATIO = 1.6;

/** Prefix of an uploaded design, followed by its file name. */
export const CUSTOM_CARD_DESIGN_PREFIX = 'custom:card-designs/';

/**
 * Band behind an upload's top row. A photo has not been measured the way the
 * bundled artwork has, so it gets a band as strong as the busiest template's,
 * and the uploader picks the text colour while looking at the result.
 */
export const CUSTOM_CARD_DESIGN_SCRIM: Record<CardTextTone, number> = {
  light: 0.55,
  dark: 0.62,
};

const TEMPLATE_BY_ID = new Map(CARD_DESIGN_TEMPLATES.map((template) => [template.id, template]));

export function getCardDesignTemplate(id?: string | null): CardDesignTemplate | null {
  if (!id) return null;
  return TEMPLATE_BY_ID.get(id) ?? null;
}

export function templatesForGenre(genre: CardDesignGenre): CardDesignTemplate[] {
  return CARD_DESIGN_TEMPLATES.filter((template) => template.genre === genre);
}

export function isCustomCardDesign(value?: string | null): boolean {
  return !!value && value.startsWith(CUSTOM_CARD_DESIGN_PREFIX);
}

/**
 * File name for an upload. The text colour the uploader chose rides in the
 * name (`<id>.text-light.jpg`), so it travels with the file through backups and
 * the "My uploads" library without a column of its own.
 */
export function customCardDesignFileName(id: string, textTone: CardTextTone): string {
  return `${id}.text-${textTone}.jpg`;
}

/** The text colour an upload was saved with; light when the name says nothing. */
export function customCardDesignTextTone(value: string): CardTextTone {
  return /\.text-dark\.[a-z0-9]+$/i.test(value) ? 'dark' : 'light';
}

export interface CardDesignAppearance {
  source: ImageSourcePropType;
  textTone: CardTextTone;
  scrim: number;
}

/**
 * Everything a card needs to draw a stored design, or null for the plain card.
 * `resolveCustomUri` turns a `custom:` id into a file uri (null when the file is
 * gone); it is injected so this stays free of the filesystem.
 */
export function resolveCardDesignAppearance(
  value: string | null | undefined,
  resolveCustomUri: (value: string) => string | null,
): CardDesignAppearance | null {
  if (!value) return null;
  if (isCustomCardDesign(value)) {
    const uri = resolveCustomUri(value);
    if (!uri) return null;
    const textTone = customCardDesignTextTone(value);
    return { source: { uri }, textTone, scrim: CUSTOM_CARD_DESIGN_SCRIM[textTone] };
  }
  const template = getCardDesignTemplate(value);
  if (!template) return null;
  return { source: template.source, textTone: template.textTone, scrim: template.scrim };
}
