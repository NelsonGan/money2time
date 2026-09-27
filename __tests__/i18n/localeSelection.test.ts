import { getLocales } from 'expo-localization';

import {
  getDeviceLocale,
  getLocaleLabel,
  I18n,
  orderedLocales,
  setAppLocale,
  SUPPORTED_LOCALES,
} from '../../lib/i18n';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US' }]),
}));

const mockGetLocales = getLocales as jest.MockedFunction<typeof getLocales>;

describe('Chinese locale selection', () => {
  afterEach(() => {
    setAppLocale('en');
    mockGetLocales.mockReset();
  });

  it('offers distinct Simplified and Traditional Chinese choices', () => {
    expect(SUPPORTED_LOCALES).toContain('zh');
    expect(SUPPORTED_LOCALES).toContain('zh-Hant');
    expect(getLocaleLabel('zh')).toBe('简体中文');
    expect(getLocaleLabel('zh-Hant')).toBe('繁體中文');
    expect(orderedLocales('zh-Hant').slice(0, 2)).toEqual(['zh-Hant', 'en']);
  });

  it.each(['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-HK', 'zh_Hant_TW'])(
    'uses Traditional Chinese for %s',
    (tag) => {
      setAppLocale(tag);
      expect(I18n.locale).toBe('zh-Hant');
      expect(I18n.t('common.close')).toBe('關閉');
    },
  );

  it.each(['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW'])(
    'keeps Simplified Chinese for %s',
    (tag) => {
      setAppLocale(tag);
      expect(I18n.locale).toBe('zh');
      expect(I18n.t('common.close')).toBe('关闭');
    },
  );

  it('uses the device region when its Chinese language tag has no variant', () => {
    mockGetLocales.mockReturnValue([
      { languageTag: 'zh', languageCode: 'zh', regionCode: 'TW' } as ReturnType<
        typeof getLocales
      >[number],
    ]);
    expect(getDeviceLocale()).toBe('zh-Hant');
  });
});
