describe('Liquid Glass navigation availability', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function loadForPlatform(
    platform: 'ios' | 'android',
    options: { liquidGlass?: boolean; glassAPI?: boolean; missingModule?: boolean } = {},
  ) {
    const view = () => null;
    const moduleFactory = jest.fn(() => {
      if (options.missingModule) throw new Error('Native module missing');
      return {
        GlassView: view,
        isLiquidGlassAvailable: () => options.liquidGlass ?? true,
        isGlassEffectAPIAvailable: () => options.glassAPI ?? true,
      };
    });
    jest.doMock('react-native', () => ({ Platform: { OS: platform } }));
    jest.doMock('expo-glass-effect', moduleFactory);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getLiquidGlassNavView } =
      require('~/components/navigation/liquidGlass') as typeof import('~/components/navigation/liquidGlass');
    return { getLiquidGlassNavView, moduleFactory, view };
  }

  it('uses the native view on an eligible iOS build', () => {
    const { getLiquidGlassNavView, moduleFactory, view } = loadForPlatform('ios');
    expect(getLiquidGlassNavView()).toBe(view);
    expect(getLiquidGlassNavView()).toBe(view);
    expect(moduleFactory).toHaveBeenCalledTimes(1);
  });

  it('falls back when iOS lacks the glass API', () => {
    const { getLiquidGlassNavView } = loadForPlatform('ios', { glassAPI: false });
    expect(getLiquidGlassNavView()).toBeNull();
  });

  it('falls back on older iOS versions', () => {
    const { getLiquidGlassNavView } = loadForPlatform('ios', { liquidGlass: false });
    expect(getLiquidGlassNavView()).toBeNull();
  });

  it('falls back when the native module is absent from an older binary', () => {
    const { getLiquidGlassNavView } = loadForPlatform('ios', { missingModule: true });
    expect(getLiquidGlassNavView()).toBeNull();
  });

  it('never loads the iOS module on Android', () => {
    const { getLiquidGlassNavView, moduleFactory } = loadForPlatform('android');
    expect(getLiquidGlassNavView()).toBeNull();
    expect(moduleFactory).not.toHaveBeenCalled();
  });
});
