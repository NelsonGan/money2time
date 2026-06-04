import { FEATURE_ANNOUNCEMENTS } from './announcements';

export interface FeatureAnnouncementPage {
  eyebrow?: string;
  title: string;
  body: string;
  bullets?: string[];
  accent: 'primary' | 'success' | 'warning' | 'error' | 'lavender' | 'sky';
  visual?: 'monthly' | 'weekly' | 'calendar';
}

export interface FeatureAnnouncement {
  id: string;
  title: string;
  summary: string;
  releaseDate: string;
  announcementNumber: number;
  pages: FeatureAnnouncementPage[];
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

export function getLatestUnseenFeatureAnnouncement(seenIds: readonly string[]) {
  const seen = new Set(seenIds);
  const latestAnnouncement = getLatestFeatureAnnouncement();
  if (!latestAnnouncement) return null;
  return seen.has(latestAnnouncement.id) ? null : latestAnnouncement;
}
