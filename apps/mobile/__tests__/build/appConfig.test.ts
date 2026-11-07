const originalVariant = process.env.APP_VARIANT;

afterEach(() => {
  if (originalVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = originalVariant;
  jest.resetModules();
});

function configure(variant?: string) {
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  jest.resetModules();
  return require('../../app.config').default({ config: {} });
}

describe('update compatibility for bundled assets', () => {
  it.each(['development', 'preview'])('%s updates require a matching native build', (variant) => {
    const config = configure(variant);
    expect(config.updates.enabled).toBe(true);
    expect(config.runtimeVersion).toMatch(/-assets-[a-f0-9]{16}$/);
    const sdkMajor = require('expo/package.json').version.split('.')[0];
    expect(config.runtimeVersion.split('-assets-')[0]).toBe(
      `${require('../../app.json').expo.version}-sdk${sdkMajor}`,
    );
  });

  it('lets a rebuilt development client load the matching preview bundle', () => {
    expect(configure('development').runtimeVersion).toBe(configure('preview').runtimeVersion);
  });

  it.each(['production', undefined, 'other'])(
    '%s keeps the store runtime and disables updates',
    (variant) => {
      const config = configure(variant);
      expect(config.updates.enabled).toBe(false);
      expect(config.runtimeVersion).toEqual({ policy: 'appVersion' });
    },
  );
});

describe('build variants', () => {
  it.each(['development', 'preview', 'production', undefined])(
    '%s builds the store app, widgets included',
    (variant) => {
      const config = configure(variant);
      expect(config.ios.bundleIdentifier).toBe('com.nelsongan.money2time');
      expect(config.ios.googleServicesFile).toBe('./GoogleService-Info.plist');
      expect(config.name).toBe(require('../../app.json').expo.name);
      const pluginNames = config.plugins.map((plugin: unknown) =>
        Array.isArray(plugin) ? plugin[0] : plugin,
      );
      expect(
        pluginNames.some((name: unknown) => String(name).includes('withMoney2TimeWidgets')),
      ).toBe(true);
    },
  );
});
