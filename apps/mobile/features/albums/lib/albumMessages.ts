import { CloudSyncApiError } from '~/features/cloudSync/services/cloudSyncApi';
import { sharingErrorMessage } from '~/features/sharedLedgers/lib/sharing';
import { I18n } from '~/lib/i18n';

import { MAX_ALBUM_PEOPLE, type PeopleEditError } from './albumPeople';

/**
 * Sharing an album is free and has no limit of its own: this is the Worker's
 * ceiling against misuse, far above what anyone shares. As many people can
 * join as an album holds (MAX_ALBUM_PEOPLE).
 */
const MAX_SHARED_ALBUMS = 50;

/** Why the user's name could not be changed, in words; null when there is nothing to say. */
export function peopleEditMessage(error: PeopleEditError): string | null {
  return error === 'taken' ? I18n.t('albums.people.name_taken') : null;
}

/** Why sharing an album (or a change to its sharing) failed, in words. */
export function albumSharingMessage(error: unknown): string {
  if (error instanceof CloudSyncApiError) {
    if (error.code === 'limit_reached') {
      return I18n.t('albums.share.limit', { max: MAX_SHARED_ALBUMS });
    }
    if (error.code === 'full') return I18n.t('albums.share.full', { max: MAX_ALBUM_PEOPLE });
  }
  return sharingErrorMessage(error);
}
