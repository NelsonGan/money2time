import { FEATURE_ANNOUNCEMENTS } from './announcements';

/** Device capabilities an announcement can be gated on for the auto-popup. */
export type AnnouncementCapability = 'voice';

export interface FeatureAnnouncementPage {
  eyebrow?: string;
  title: string;
  body: string;
  bullets?: string[];
  accent: 'primary' | 'success' | 'warning' | 'error' | 'lavender' | 'sky';
  visual?: 'monthly' | 'quickAdd' | 'weekly' | 'calendar' | 'savings' | 'savingsHistory' | 'voice';
  /** Optional call-to-action that replaces the primary button on this page. */
  cta?: 'enableVoice';
  /** Plain-text label for the CTA button (announcements are English-only, like their copy). */
  ctaLabel?: string;
}

export interface FeatureAnnouncement {
  id: string;
  title: string;
  summary: string;
  releaseDate: string;
  announcementNumber: number;
  pages: FeatureAnnouncementPage[];
  /**
   * When set, the auto-popup only fires for users whose device supports this
   * capability. The announcement is still always listed in the News screen.
   */
  requiresCapability?: AnnouncementCapability;
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
