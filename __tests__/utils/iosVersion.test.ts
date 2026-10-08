import { iosMajorVersion, isIosAtLeast, supportsSharedAutomations } from '~/utils/iosVersion';

describe('iosMajorVersion', () => {
  it('reads the major version from an iOS version string', () => {
    expect(iosMajorVersion('ios', '27.0.1')).toBe(27);
    expect(iosMajorVersion('ios', '18.6')).toBe(18);
  });

  it('is null off iOS, where Platform.Version is an API level', () => {
    expect(iosMajorVersion('android', 36)).toBeNull();
    expect(iosMajorVersion('web', '')).toBeNull();
  });

  it('is null for a version it cannot read', () => {
    expect(iosMajorVersion('ios', '')).toBeNull();
  });
});

describe('supportsSharedAutomations', () => {
  it('starts at iOS 27', () => {
    expect(supportsSharedAutomations('ios', '26.4')).toBe(false);
    expect(supportsSharedAutomations('ios', '27.0')).toBe(true);
    expect(supportsSharedAutomations('ios', '28.1')).toBe(true);
  });

  it('never applies to Android, whatever its API level', () => {
    expect(supportsSharedAutomations('android', 36)).toBe(false);
  });
});

describe('isIosAtLeast', () => {
  it('compares the major version against the minimum', () => {
    expect(isIosAtLeast('ios', '26.4', 27)).toBe(false);
    expect(isIosAtLeast('ios', '27.0.1', 27)).toBe(true);
  });

  it('is false off iOS', () => {
    expect(isIosAtLeast('android', 36, 27)).toBe(false);
  });
});
