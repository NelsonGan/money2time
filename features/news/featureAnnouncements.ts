import { I18n } from '~/lib/i18n';

import { FEATURE_ANNOUNCEMENTS } from './announcements';

/** Device capabilities an announcement can be gated on for the auto-popup. */
export type AnnouncementCapability = 'voice';

export interface FeatureAnnouncementPage {
  /** Page content key — copy resolves from `news.<announcement.i18nKey>.<key>`. */
  key: string;
  accent: 'primary' | 'success' | 'warning' | 'error' | 'lavender' | 'sky';
  visual?:
    | 'monthly'
    | 'quickAdd'
    | 'weekly'
    | 'calendar'
    | 'savings'
    | 'savingsHistory'
    | 'voice'
    | 'shareEarn';
  /** Optional call-to-action that replaces the primary button on this page. */
  cta?: 'enableVoice' | 'openShareEarn';
}

export interface FeatureAnnouncement {
  id: string;
  /** i18n namespace for this announcement's copy under `news.<i18nKey>`. */
  i18nKey: string;
  releaseDate: string;
  announcementNumber: number;
  pages: FeatureAnnouncementPage[];
  /**
   * When set, the auto-popup only fires for users whose device supports this
   * capability. The announcement is still always listed in the News screen.
   */
  requiresCapability?: AnnouncementCapability;
}

/** Localized title shown in the News list and announcement summaries. */
export function announcementTitle(announcement: FeatureAnnouncement): string {
  return I18n.t(`news.${announcement.i18nKey}.title`);
}

/** Localized title for a single announcement page. */
export function announcementPageTitle(
  announcement: FeatureAnnouncement,
  page: FeatureAnnouncementPage,
): string {
  return I18n.t(`news.${announcement.i18nKey}.${page.key}.title`);
}

/** Localized body copy for a single announcement page. */
export function announcementPageBody(
  announcement: FeatureAnnouncement,
  page: FeatureAnnouncementPage,
): string {
  return I18n.t(`news.${announcement.i18nKey}.${page.key}.body`);
}

/** Localized label for a page call-to-action button. */
export function announcementCtaLabel(cta: NonNullable<FeatureAnnouncementPage['cta']>): string {
  switch (cta) {
    case 'openShareEarn':
      return I18n.t('news.cta.open_share_earn');
    case 'enableVoice':
    default:
      return I18n.t('news.cta.enable_voice');
  }
}

export { FEATURE_ANNOUNCEMENTS } from './announcements';

export function getFeatureAnnouncementsNewestFirst() {
  return [...FEATURE_ANNOUNCEMENTS].sort((a, b) => {
    const byDate = b.releaseDate.localeCompare(a.releaseDate);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

export function getLatestFeatureAnnouncement() {
  return getFeatureAnnouncementsNewestFirst()[0] ?? null;
}

export function getFeatureAnnouncementById(id: string) {
  return FEATURE_ANNOUNCEMENTS.find((announcement) => announcement.id === id) ?? null;
}

export function getLatestUnseenFeatureAnnouncement(
  seenIds: readonly string[],
  options?: { availableCapabilities?: readonly AnnouncementCapability[] },
) {
  const seen = new Set(seenIds);
  const available = new Set(options?.availableCapabilities ?? []);
  // Only consider announcements the user is eligible to see — a capability-gated
  // announcement is skipped (along with anything older it would shadow) on
  // devices that lack the capability, so the auto-popup never surfaces it there.
  const latestEligible = getFeatureAnnouncementsNewestFirst().find(
    (announcement) =>
      !announcement.requiresCapability || available.has(announcement.requiresCapability),
  );
  if (!latestEligible) return null;
  return seen.has(latestEligible.id) ? null : latestEligible;
}
