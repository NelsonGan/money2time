import {
  getFeatureAnnouncementsNewestFirst,
  getLatestFeatureAnnouncement,
  getLatestUnseenFeatureAnnouncement,
} from '~/features/news/featureAnnouncements';
import {
  featureAnnouncementStateTestUtils,
  getLatestUnseenAnnouncementForUser,
  getSeenFeatureAnnouncementIds,
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

  it('only auto-selects the latest eligible announcement, not older unseen announcements', () => {
    const latest = getLatestFeatureAnnouncement();
    expect(latest).not.toBeNull();
    // Grant every capability so the newest announcement is eligible regardless of gating.
    const caps = { availableCapabilities: ['voice', 'autoLog'] as const };
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
    const surfaced = getLatestUnseenFeatureAnnouncement([]);
    expect(surfaced).not.toBeNull();
    expect(surfaced?.requiresCapability).toBeUndefined();
  });

  it('stores seen announcement ids per app user', async () => {
    await markFeatureAnnouncementSeen('user-a', 'feature-1');
    await markFeatureAnnouncementSeen('user-a', 'feature-1');
    await markFeatureAnnouncementSeen('user-b', 'feature-2');

    await expect(getSeenFeatureAnnouncementIds('user-a')).resolves.toEqual(['feature-1']);
    await expect(getSeenFeatureAnnouncementIds('user-b')).resolves.toEqual(['feature-2']);
  });

  it('returns the latest unseen announcement for a user until it is marked seen', async () => {
    const latest = getLatestFeatureAnnouncement();
    expect(latest).not.toBeNull();

    await expect(
      getLatestUnseenAnnouncementForUser('user-a', ['voice', 'autoLog']),
    ).resolves.toMatchObject({
      id: latest!.id,
    });

    await markFeatureAnnouncementSeen('user-a', latest!.id);
    await expect(
      getLatestUnseenAnnouncementForUser('user-a', ['voice', 'autoLog']),
    ).resolves.toBeNull();
  });

  it('ignores corrupted seen-state payloads', () => {
    expect(featureAnnouncementStateTestUtils.parseSeenIds('{bad json')).toEqual([]);
    expect(featureAnnouncementStateTestUtils.parseSeenIds(JSON.stringify([1, 'valid']))).toEqual([
      'valid',
    ]);
  });
});
