import {
  announcementPagesForPlatform,
  getFeatureAnnouncementById,
  getFeatureAnnouncementsNewestFirst,
  getLatestFeatureAnnouncement,
  getLatestUnseenFeatureAnnouncement,
} from '~/features/news/featureAnnouncements';
import {
  featureAnnouncementStateTestUtils,
  getLatestUnseenAnnouncementForUser,
  getSeenFeatureAnnouncementIds,
  markCurrentFeatureAnnouncementsSeen,
  markFeatureAnnouncementSeen,
} from '~/services/featureAnnouncementState';

const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  }),
}));

describe('feature announcement state', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('sorts announcements newest first by numbered release order', () => {
    const announcements = getFeatureAnnouncementsNewestFirst();
    expect(announcements.length).toBeGreaterThan(0);
    expect(announcements[0].announcementNumber).toBe(
      getLatestFeatureAnnouncement()?.announcementNumber,
    );
  });

  it('surfaces the RiceCal promotion as the latest announcement', () => {
    expect(getLatestFeatureAnnouncement()).toMatchObject({
      id: 'ricecal_2026_09',
      announcementNumber: 17,
      pages: [
        {
          key: 'intro',
          badge: 'ad',
          cta: 'openRiceCal',
          visual: 'ricecal',
        },
      ],
    });
  });

  it('drops a platform-only page off that platform, keeping the rest', () => {
    const latest = getFeatureAnnouncementById('month_cycle_live_earnings_2026_09')!;
    // The Live Activity page is iOS only; the other three apply everywhere, so
    // the announcement itself must survive on Android rather than being gated.
    expect(announcementPagesForPlatform(latest, 'ios').map((page) => page.key)).toEqual([
      'monthCycle',
      'liveEarnings',
      'appIcon',
      'loanInterest',
    ]);
    expect(announcementPagesForPlatform(latest, 'android').map((page) => page.key)).toEqual([
      'monthCycle',
      'appIcon',
      'loanInterest',
    ]);
  });

  it('keeps every page of an announcement that gates none of them', () => {
    for (const announcement of getFeatureAnnouncementsNewestFirst()) {
      if (announcement.pages.some((page) => page.platform)) continue;
      expect(announcementPagesForPlatform(announcement, 'android')).toEqual(announcement.pages);
    }
  });

  it('only auto-selects the latest eligible announcement, not older unseen announcements', () => {
    const latest = getLatestFeatureAnnouncement();
    expect(latest).not.toBeNull();
    // Grant every capability so the newest announcement is eligible regardless of gating.
    const caps = { availableCapabilities: ['voice', 'autoLog'] as const, platformOS: 'ios' };
    expect(getLatestUnseenFeatureAnnouncement([], caps)?.id).toBe(latest?.id);
    expect(getLatestUnseenFeatureAnnouncement([latest!.id], caps)).toBeNull();
  });

  it('skips capability-gated announcements on devices without the capability', () => {
    // The catalog contains capability-gated announcements (voice, autoLog).
    const gatedCapabilities = getFeatureAnnouncementsNewestFirst()
      .filter((a) => a.requiresCapability)
      .map((a) => a.requiresCapability);
    expect(gatedCapabilities).toEqual(expect.arrayContaining(['voice', 'autoLog']));
    // With no capabilities available, the auto-popup never surfaces a gated announcement.
    const surfaced = getLatestUnseenFeatureAnnouncement([], { platformOS: 'ios' });
    expect(surfaced).not.toBeNull();
    expect(surfaced?.requiresCapability).toBeUndefined();
    // Android-like device: voice may exist but autoLog never does. The newest
    // (autoLog-gated) announcement is skipped and a supported one surfaces.
    const androidSurfaced = getLatestUnseenFeatureAnnouncement([], {
      availableCapabilities: ['voice'],
      platformOS: 'android',
    });
    expect(androidSurfaced).not.toBeNull();
    expect(androidSurfaced?.requiresCapability).not.toBe('autoLog');
  });

  it('never auto-selects an announcement with no page for this platform', () => {
    // The modal renders nothing for such an announcement, but the caller has
    // already marked the prompt visible — so it would never be dismissed, never
    // be marked seen, and would block the cloud-backup prompt for the session.
    for (const platformOS of ['ios', 'android']) {
      const surfaced = getLatestUnseenFeatureAnnouncement([], {
        availableCapabilities: ['voice', 'autoLog'],
        platformOS,
      });
      expect(surfaced).not.toBeNull();
      expect(announcementPagesForPlatform(surfaced!, platformOS).length).toBeGreaterThan(0);
    }
  });

  it('stores seen announcement ids per app user', async () => {
    await markFeatureAnnouncementSeen('user-a', 'feature-1');
    await markFeatureAnnouncementSeen('user-a', 'feature-1');
    await markFeatureAnnouncementSeen('user-b', 'feature-2');

    await expect(getSeenFeatureAnnouncementIds('user-a')).resolves.toEqual(['feature-1']);
    await expect(getSeenFeatureAnnouncementIds('user-b')).resolves.toEqual(['feature-2']);
  });

  it('silences existing announcements for a new user without affecting another user', async () => {
    await markCurrentFeatureAnnouncementsSeen('new-user');

    await expect(
      getLatestUnseenAnnouncementForUser('new-user', ['voice', 'autoLog'], 'ios'),
    ).resolves.toBeNull();
    await expect(
      getLatestUnseenAnnouncementForUser('returning-user', ['voice', 'autoLog'], 'ios'),
    ).resolves.toMatchObject({ id: getLatestFeatureAnnouncement()?.id });
    expect(await getSeenFeatureAnnouncementIds('new-user')).toHaveLength(
      getFeatureAnnouncementsNewestFirst().length,
    );
  });

  it('returns the latest unseen announcement for a user until it is marked seen', async () => {
    const latest = getLatestFeatureAnnouncement();
    expect(latest).not.toBeNull();

    await expect(
      getLatestUnseenAnnouncementForUser('user-a', ['voice', 'autoLog'], 'ios'),
    ).resolves.toMatchObject({
      id: latest!.id,
    });

    await markFeatureAnnouncementSeen('user-a', latest!.id);
    await expect(
      getLatestUnseenAnnouncementForUser('user-a', ['voice', 'autoLog'], 'ios'),
    ).resolves.toBeNull();
  });

  it('ignores corrupted seen-state payloads', () => {
    expect(featureAnnouncementStateTestUtils.parseSeenIds('{bad json')).toEqual([]);
    expect(featureAnnouncementStateTestUtils.parseSeenIds(JSON.stringify([1, 'valid']))).toEqual([
      'valid',
    ]);
  });
});
