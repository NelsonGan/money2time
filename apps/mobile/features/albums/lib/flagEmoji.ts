/**
 * Whether an emoji is a rectangular flag: a country or region (two regional
 * indicator letters, like 🇯🇵), a subdivision (🏴 with tag letters, like
 * Scotland's), or the rainbow, transgender and pirate flags. These draw as a
 * full-width waving rectangle, which is what lets an album card's round badge
 * fill its circle with one. 🏁, 🚩, 🎌, 🏳️ and 🏴 alone are pictures of flags
 * on poles or crossed, not a rectangle, so they are not. Pure.
 */
const COUNTRY_FLAG = /^[\u{1F1E6}-\u{1F1FF}]{2}$/u;
const SUBDIVISION_FLAG = /^\u{1F3F4}[\u{E0061}-\u{E007A}]+\u{E007F}$/u;
const OTHER_FLAGS = new Set([
  '\u{1F3F3}\u{FE0F}\u{200D}\u{1F308}', // 🏳️‍🌈
  '\u{1F3F3}\u{FE0F}\u{200D}\u{26A7}\u{FE0F}', // 🏳️‍⚧️
  '\u{1F3F4}\u{200D}\u{2620}\u{FE0F}', // 🏴‍☠️
]);

export function isFlagEmoji(glyph: string): boolean {
  const value = glyph.trim();
  return COUNTRY_FLAG.test(value) || SUBDIVISION_FLAG.test(value) || OTHER_FLAGS.has(value);
}

/**
 * A country's flag emoji from its ISO 3166-1 alpha-2 code (`JP` → 🇯🇵), as the
 * two regional indicator letters; null for anything else. Pure.
 */
export function flagEmojiForCountry(countryCode: string | null | undefined): string | null {
  const code = countryCode?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return String.fromCodePoint(...Array.from(code, (letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

/** A country's flag as a stored icon (`emoji:🇯🇵`), or null without one. Pure. */
export function flagIconForCountry(countryCode: string | null | undefined): string | null {
  const flag = flagEmojiForCountry(countryCode);
  return flag ? `emoji:${flag}` : null;
}

/**
 * An album form's icon after its location changes from one country to another
 * (README: Key patterns > Albums, An album's icon): the new country's flag
 * fills an empty icon, and replaces the old country's flag, so a flag follows
 * the place; an icon the user picked stays. Clearing the location takes away
 * its flag. `''` is no icon, as in the forms. Pure.
 */
export function albumIconAfterLocationChange(
  icon: string,
  previousCountryCode: string | null | undefined,
  nextCountryCode: string | null | undefined,
): string {
  const previousFlag = flagIconForCountry(previousCountryCode);
  const nextFlag = flagIconForCountry(nextCountryCode);
  if (icon === '' || (previousFlag !== null && icon === previousFlag)) return nextFlag ?? '';
  return icon;
}
