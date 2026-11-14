import { FEATURE_FLAGS, useFeatureFlag } from '~/services/featureFlags';

import { sharedAlbumsAllowed } from '../lib/sharedAlbumsRollout';

/**
 * Whether this user may make a shared album: the `shared_albums` rollout flag
 * (README: Shared albums rollout), read as a plain rollout with no
 * `$feature_flag_called`. Only New Album asks; joining from a link and an
 * album already shared never do.
 */
export function useSharedAlbumsAllowed(): boolean {
  const flag = useFeatureFlag(FEATURE_FLAGS.sharedAlbums, { sendEvent: false });
  return sharedAlbumsAllowed(flag, __DEV__);
}
