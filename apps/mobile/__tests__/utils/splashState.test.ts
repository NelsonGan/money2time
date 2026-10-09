describe('splashState', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function load() {
    return require('~/utils/splashState') as typeof import('~/utils/splashState');
  }

  it('holds callbacks until the splash is hidden, then runs each once', () => {
    const { markSplashHidden, whenSplashHidden } = load();
    const first = jest.fn();
    const second = jest.fn();
    whenSplashHidden(first);
    whenSplashHidden(second);
    expect(first).not.toHaveBeenCalled();

    markSplashHidden();
    markSplashHidden();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('runs a callback straight away once the splash is already hidden', () => {
    const { markSplashHidden, whenSplashHidden } = load();
    markSplashHidden();
    const callback = jest.fn();
    whenSplashHidden(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('never runs a callback that was cancelled while waiting', () => {
    const { markSplashHidden, whenSplashHidden } = load();
    const callback = jest.fn();
    const cancel = whenSplashHidden(callback);
    cancel();
    markSplashHidden();
    expect(callback).not.toHaveBeenCalled();
  });
});
