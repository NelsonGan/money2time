import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getLatestUnseenFeatureAnnouncement,
  type FeatureAnnouncement,
} from '~/features/news/featureAnnouncements';

const FEATURE_ANNOUNCEMENT_STORAGE_PREFIX = 'money2time.featureAnnouncements.seenIds';

function storageKey(appUserId: string) {
  return `${FEATURE_ANNOUNCEMENT_STORAGE_PREFIX}:${appUserId}`;
}

function parseSeenIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export async function getSeenFeatureAnnouncementIds(appUserId: string): Promise<string[]> {
  const value = await AsyncStorage.getItem(storageKey(appUserId));
  return parseSeenIds(value);
}

export async function markFeatureAnnouncementSeen(appUserId: string, announcementId: string) {
  const seenIds = await getSeenFeatureAnnouncementIds(appUserId);
  if (seenIds.includes(announcementId)) return;
  await AsyncStorage.setItem(storageKey(appUserId), JSON.stringify([...seenIds, announcementId]));
}

export async function getLatestUnseenAnnouncementForUser(
  appUserId: string,
): Promise<FeatureAnnouncement | null> {
  const seenIds = await getSeenFeatureAnnouncementIds(appUserId);
  return getLatestUnseenFeatureAnnouncement(seenIds);
}

export const featureAnnouncementStateTestUtils = {
  parseSeenIds,
  storageKey,
};
