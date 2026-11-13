import { useMemo } from 'react';

import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { getProfileAvatarUri } from '~/services/userAssets';

/** How the user is shown among the people of a bill or an album. */
export interface SelfPerson {
  /** The name set in Settings, else "Me". */
  name: string;
  /** The photo set in Settings, as a file uri, or null. */
  avatarUri: string | null;
}

/**
 * The user as their profile in Settings has them: its name and photo, "Me"
 * and their initial when they set neither. Display only: what a bill's own
 * row stores for the user stays as it was written.
 */
export function useSelfPerson(): SelfPerson {
  const { settings } = useApp();
  const profileName = settings.profileName?.trim() || null;
  const avatarPath = settings.profileAvatarUri;
  return useMemo(
    () => ({
      name: profileName ?? I18n.t('transactions.editor.split.me_label'),
      // A file check: read once per photo, not on every render.
      avatarUri: getProfileAvatarUri(avatarPath),
    }),
    [avatarPath, profileName],
  );
}
