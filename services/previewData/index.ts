// Localized preview-data seeder. Replaces the local database with rich,
// screenshot-ready sample data tailored to one of five locale profiles.
//
// - Shared types & static blueprints live in ./shared
// - Each locale profile lives in ./profiles/*
// - The seeding logic lives in ./seed
import { americanProfile } from './profiles/american';
import { chineseProfile } from './profiles/chinese';
import { malaysianEnProfile } from './profiles/malaysianEn';
import { malaysianZhProfile } from './profiles/malaysianZh';
import { taiwaneseProfile } from './profiles/taiwanese';
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
};

export function seedPreviewData(
  profileName: PreviewSeedProfile,
  receiptRelativePath?: string | null,
): PreviewSeedSummary {
  return seedProfile(profileName, PREVIEW_PROFILES[profileName], receiptRelativePath);
}
