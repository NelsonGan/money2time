// Localized preview-data seeder. Replaces the local database with rich,
// screenshot-ready sample data tailored to one locale profile.
//
// - Shared types & static blueprints live in ./shared
// - Each locale profile lives in ./profiles/*; most are built from compact
//   per-country specs by ./profiles/localized
// - The seeding logic lives in ./seed
import { americanProfile } from './profiles/american';
import { brazilianProfile } from './profiles/brazilian';
import { chineseProfile } from './profiles/chinese';
import { danishProfile } from './profiles/danish';
import { dutchProfile } from './profiles/dutch';
import { filipinoProfile } from './profiles/filipino';
import { frenchProfile } from './profiles/french';
import { germanProfile } from './profiles/german';
import { indianProfile } from './profiles/indian';
import { indonesianProfile } from './profiles/indonesian';
import { italianProfile } from './profiles/italian';
import { japaneseProfile } from './profiles/japanese';
import { koreanProfile } from './profiles/korean';
import { malaysianEnProfile } from './profiles/malaysianEn';
import { malaysianMsProfile } from './profiles/malaysianMs';
import { malaysianZhProfile } from './profiles/malaysianZh';
import { norwegianProfile } from './profiles/norwegian';
import { polishProfile } from './profiles/polish';
import { russianProfile } from './profiles/russian';
import { spanishProfile } from './profiles/spanish';
import { swedishProfile } from './profiles/swedish';
import { taiwaneseProfile } from './profiles/taiwanese';
import { thaiProfile } from './profiles/thai';
import { turkishProfile } from './profiles/turkish';
import { ukrainianProfile } from './profiles/ukrainian';
import { vietnameseProfile } from './profiles/vietnamese';
import { seedProfile } from './seed';
import type { PreviewProfile, PreviewSeedProfile, PreviewSeedSummary } from './shared';

export { preparePreviewReceipt } from './receipts';
export { wageConfigForMonthsAgo } from './seed';
export type { PreviewSeedProfile, PreviewSeedSummary } from './shared';
export { CATEGORY_BLUEPRINT } from './shared';

export const PREVIEW_PROFILES: Record<PreviewSeedProfile, PreviewProfile> = {
  american: americanProfile,
  chinese: chineseProfile,
  taiwanese: taiwaneseProfile,
  malaysian_en: malaysianEnProfile,
  malaysian_zh: malaysianZhProfile,
  malaysian_ms: malaysianMsProfile,
  brazilian: brazilianProfile,
  danish: danishProfile,
  dutch: dutchProfile,
  filipino: filipinoProfile,
  french: frenchProfile,
  german: germanProfile,
  indian: indianProfile,
  indonesian: indonesianProfile,
  italian: italianProfile,
  japanese: japaneseProfile,
  korean: koreanProfile,
  norwegian: norwegianProfile,
  polish: polishProfile,
  russian: russianProfile,
  spanish: spanishProfile,
  swedish: swedishProfile,
  thai: thaiProfile,
  turkish: turkishProfile,
  ukrainian: ukrainianProfile,
  vietnamese: vietnameseProfile,
};

// The profile each app language gets for its store screenshots. English and
// Chinese show Malaysia, where most of the app's users are (alongside Malay);
// every other language shows its main country.
export const PREVIEW_PROFILE_FOR_LOCALE: Record<string, PreviewSeedProfile> = {
  en: 'malaysian_en',
  zh: 'malaysian_zh',
  ms: 'malaysian_ms',
  'zh-Hant': 'taiwanese',
  da: 'danish',
  de: 'german',
  es: 'spanish',
  fil: 'filipino',
  fr: 'french',
  hi: 'indian',
  id: 'indonesian',
  it: 'italian',
  ja: 'japanese',
  ko: 'korean',
  nb: 'norwegian',
  nl: 'dutch',
  pl: 'polish',
  pt: 'brazilian',
  ru: 'russian',
  sv: 'swedish',
  th: 'thai',
  tr: 'turkish',
  uk: 'ukrainian',
  vi: 'vietnamese',
};

// Labels for the developer picker, which is English-only like the rest of the
// developer tools apart from the original Chinese copy.
export const PREVIEW_PROFILE_LABELS: Record<PreviewSeedProfile, string> = {
  american: 'United States (English)',
  chinese: 'China (中文)',
  taiwanese: 'Taiwan (繁體中文)',
  malaysian_en: 'Malaysia (English)',
  malaysian_zh: 'Malaysia (中文)',
  malaysian_ms: 'Malaysia (Bahasa Melayu)',
  brazilian: 'Brazil (Português)',
  danish: 'Denmark (Dansk)',
  dutch: 'Netherlands (Nederlands)',
  filipino: 'Philippines (Filipino)',
  french: 'France (Français)',
  german: 'Germany (Deutsch)',
  indian: 'India (हिन्दी)',
  indonesian: 'Indonesia (Bahasa Indonesia)',
  italian: 'Italy (Italiano)',
  japanese: 'Japan (日本語)',
  korean: 'South Korea (한국어)',
  norwegian: 'Norway (Norsk)',
  polish: 'Poland (Polski)',
  russian: 'Russia (Русский)',
  spanish: 'Spain (Español)',
  swedish: 'Sweden (Svenska)',
  thai: 'Thailand (ไทย)',
  turkish: 'Turkey (Türkçe)',
  ukrainian: 'Ukraine (Українська)',
  vietnamese: 'Vietnam (Tiếng Việt)',
};

export function seedPreviewData(
  profileName: PreviewSeedProfile,
  receiptRelativePath?: string | null,
): PreviewSeedSummary {
  return seedProfile(profileName, PREVIEW_PROFILES[profileName], receiptRelativePath);
}
