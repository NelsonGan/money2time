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

  it('only auto-selects the latest announcement, not older unseen announcements', () => {
    const latest = getLatestFeatureAnnouncement();
    expect(latest).not.toBeNull();
    expect(getLatestUnseenFeatureAnnouncement([])?.id).toBe(latest?.id);
    expect(getLatestUnseenFeatureAnnouncement([latest!.id])).toBeNull();
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

    await expect(getLatestUnseenAnnouncementForUser('user-a')).resolves.toMatchObject({
      id: latest!.id,
    });

    await markFeatureAnnouncementSeen('user-a', latest!.id);
    await expect(getLatestUnseenAnnouncementForUser('user-a')).resolves.toBeNull();
  });

  it('ignores corrupted seen-state payloads', () => {
    expect(featureAnnouncementStateTestUtils.parseSeenIds('{bad json')).toEqual([]);
    expect(featureAnnouncementStateTestUtils.parseSeenIds(JSON.stringify([1, 'valid']))).toEqual([
      'valid',
    ]);
  });
});
