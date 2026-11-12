import { CloudSyncApiError } from '~/features/cloudSync/services/cloudSyncApi';
import { sharingErrorMessage } from '~/features/sharedLedgers/lib/sharing';
import { I18n } from '~/lib/i18n';

import { MAX_ALBUM_PEOPLE, type PeopleEditError } from './albumPeople';

/** Albums one Pro user can share at a time, and people who can join one (the Worker's limits). */
const MAX_SHARED_ALBUMS = 3;
const MAX_ALBUM_JOINERS = 9;

/** Why a person could not be added or renamed, in words; null when there is nothing to say. */
export function peopleEditMessage(error: PeopleEditError): string | null {
  if (error === 'taken') return I18n.t('albums.people.name_taken');
  if (error === 'full') return I18n.t('albums.people.full', { max: MAX_ALBUM_PEOPLE });
  return null;
}

/** Why sharing an album (or a change to its sharing) failed, in words. */
export function albumSharingMessage(error: unknown): string {
  if (error instanceof CloudSyncApiError) {
    if (error.code === 'limit_reached') {
      return I18n.t('albums.share.limit', { max: MAX_SHARED_ALBUMS });
    }
    if (error.code === 'full') return I18n.t('albums.share.full', { max: MAX_ALBUM_JOINERS });
  }
  return sharingErrorMessage(error);
}
