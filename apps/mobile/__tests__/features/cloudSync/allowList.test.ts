import { cloudSyncAllowed } from '~/features/cloudSync/lib/allowList';

describe('cloudSyncAllowed', () => {
  it('follows a loaded flag, in release and development builds', () => {
    expect(cloudSyncAllowed(true, false)).toBe(true);
    expect(cloudSyncAllowed(false, false)).toBe(false);
    expect(cloudSyncAllowed(false, true)).toBe(false);
    expect(cloudSyncAllowed('true', false)).toBe(false);
  });

  it('is unknown until flags load, except in a development build', () => {
    expect(cloudSyncAllowed(undefined, false)).toBeUndefined();
    expect(cloudSyncAllowed(undefined, true)).toBe(true);
  });
});
