import type { LocaleModule, PhoneStrings, FeatureCopy, LandingCopy, LocaleMeta } from './types';

import en from './en';
import zh from './zh';

// ── Additional LTR languages (translations of ./en) ──────────────────────────
import es from './es';
import fr from './fr';
import de from './de';
import pt from './pt';
import it from './it';
import ja from './ja';
import ko from './ko';
import ru from './ru';
import hi from './hi';
import th from './th';
import vi from './vi';
import id from './id';
import ms from './ms';
import fil from './fil';
import tr from './tr';
import pl from './pl';
import nl from './nl';
import uk from './uk';
import sv from './sv';
import nb from './nb';
import da from './da';

export type { LocaleModule, PhoneStrings, FeatureCopy, LandingCopy, LocaleMeta };

/**
 * Display order in the toolbar: English first, Chinese, then the rest of the
 * LTR languages.
 */
export const LOCALE_MODULES: LocaleModule[] = [
  en, zh,
  es, fr, de, pt, it, ja, ko, ru, hi, th, vi, id, ms, fil, tr, pl, nl, uk, sv, nb, da,
];

export const LOCALE_REGISTRY: Record<string, LocaleModule> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m]));

export const ALL_LOCALE_CODES: string[] = LOCALE_MODULES.map((m) => m.meta.code);

export const LOCALE_META: Record<string, LocaleMeta> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.meta]));

export const PHONE_STRINGS: Record<string, PhoneStrings> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.phone]));

export const FEATURE_COPY: Record<string, FeatureCopy> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.feature]));

export const LANDING_COPY: Record<string, LandingCopy> =
  Object.fromEntries(LOCALE_MODULES.map((m) => [m.meta.code, m.landing]));

/**
 * Locales that ship their own screenshot folder under /assets/screenshots-iphone/<code>.
 * Every locale does: each is captured from the app's matching preview profile
 * (English, Chinese and Malay show Malaysia; the rest show their main country).
 */
export const NATIVE_SCREENSHOT_LOCALES = new Set<string>(ALL_LOCALE_CODES);

/** Resolve the screenshot folder for a locale, falling back to English. */
export function screenshotLocale(locale: string): string {
  return NATIVE_SCREENSHOT_LOCALES.has(locale) ? locale : 'en';
}
