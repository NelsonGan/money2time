jest.mock('@expo/config-plugins', () => ({
  AndroidConfig: {
    Manifest: {
      getMainApplicationOrThrow: (manifest: any) => manifest.manifest.application[0],
    },
  },
  withAndroidManifest: (config: any, action: (c: any) => any) => action(config),
}));

const withConfigChanges = require('../../plugins/withAndroidMainActivityConfigChanges');

const manifestWith = (configChanges?: string) => ({
  modResults: {
    manifest: {
      application: [
        {
          activity: [
            {
              $: {
                'android:name': '.MainActivity',
                ...(configChanges ? { 'android:configChanges': configChanges } : {}),
              },
            },
          ],
        },
      ],
    },
  },
});

describe('withAndroidMainActivityConfigChanges', () => {
  it('adds the handled config changes without dropping Expo’s own', () => {
    const result = withConfigChanges(manifestWith('keyboard|orientation|uiMode'));
    const value = result.modResults.manifest.application[0].activity[0].$['android:configChanges'];
    const set = value.split('|');
    expect(set).toEqual(
      expect.arrayContaining(['density', 'fontScale', 'locale', 'layoutDirection']),
    );
    expect(set.filter((entry: string) => entry === 'keyboard')).toHaveLength(1);
  });

  it('sets the attribute when the template left it out', () => {
    const result = withConfigChanges(manifestWith());
    expect(
      result.modResults.manifest.application[0].activity[0].$['android:configChanges'],
    ).toContain('fontScale');
  });
});
