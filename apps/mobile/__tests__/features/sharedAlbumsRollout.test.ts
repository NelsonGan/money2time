import { sharedAlbumsAllowed } from '~/features/albums/lib/sharedAlbumsRollout';
import { FEATURE_FLAGS } from '~/services/featureFlags';

describe('sharedAlbumsAllowed', () => {
  it('reads the shared_albums flag', () => {
    expect(FEATURE_FLAGS.sharedAlbums).toBe('shared_albums');
  });

  it('lets only a true flag make shared albums', () => {
    expect(sharedAlbumsAllowed(true, false)).toBe(true);
    expect(sharedAlbumsAllowed(false, false)).toBe(false);
    // A multivariate answer is not a yes.
    expect(sharedAlbumsAllowed('test', false)).toBe(false);
  });

  it('keeps the switch hidden in a store build until flags answer', () => {
    expect(sharedAlbumsAllowed(undefined, false)).toBe(false);
  });

  it('shows it in a development build without flags, but obeys a loaded flag there', () => {
    expect(sharedAlbumsAllowed(undefined, true)).toBe(true);
    expect(sharedAlbumsAllowed(false, true)).toBe(false);
  });
});
