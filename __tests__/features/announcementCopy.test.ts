import { FEATURE_ANNOUNCEMENTS } from '~/features/news/announcements';
import {
  announcementBadgeLabel,
  announcementCtaLabel,
  announcementPageBody,
  type FeatureAnnouncementPage,
} from '~/features/news/featureAnnouncements';
import { I18n } from '~/lib/i18n';
import { PRO_LIMITS } from '~/constants/proLimits';
import en from '~/lib/i18n/locales/en';

type Tree = { [key: string]: string | Tree };

function lookup(key: string): string | Tree | undefined {
  return key.split('.').reduce<string | Tree | undefined>(
    (node, segment) => {
      if (!node || typeof node === 'string') return undefined;
      return node[segment];
    },
    en as unknown as Tree,
  );
}

function expectString(key: string) {
  expect({ key, value: lookup(key) }).toEqual({ key, value: expect.any(String) });
}

describe('feature announcement copy', () => {
  it('has a title for every announcement', () => {
    for (const announcement of FEATURE_ANNOUNCEMENTS) {
      expectString(`news.${announcement.i18nKey}.title`);
    }
  });

  it('has a title and body for every page', () => {
    for (const announcement of FEATURE_ANNOUNCEMENTS) {
      for (const page of announcement.pages) {
        expectString(`news.${announcement.i18nKey}.${page.key}.title`);
        expectString(`news.${announcement.i18nKey}.${page.key}.body`);
      }
    }
  });

  it('resolves a label for every page CTA', () => {
    // The test i18n mock echoes the key back, so the returned value *is* the
    // key the modal would ask for — assert that key exists in en.
    for (const announcement of FEATURE_ANNOUNCEMENTS) {
      for (const page of announcement.pages) {
        if (!page.cta) continue;
        expectString(announcementCtaLabel(page.cta));
      }
    }
  });

  it('resolves a label for every page badge', () => {
    for (const announcement of FEATURE_ANNOUNCEMENTS) {
      for (const page of announcement.pages) {
        if (!page.badge) continue;
        expectString(announcementBadgeLabel(page.badge));
      }
    }
  });

  it('gives each page in an announcement a unique key', () => {
    for (const announcement of FEATURE_ANNOUNCEMENTS) {
      const keys = announcement.pages.map((page: FeatureAnnouncementPage) => page.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('keeps the announced account count tied to the free comparison limit', () => {
    expect(PRO_LIMITS.FREE_MAX_ACCOUNTS).toBe(6);
    expect(lookup('news.pro_trial_accounts.accounts.body')).toEqual(
      expect.stringContaining('{{count}}'),
    );
  });

  it('interpolates the current free account limit on the new announcement page', () => {
    const announcement = FEATURE_ANNOUNCEMENTS.find(
      (item) => item.id === 'pro_trial_accounts_2026_09',
    )!;
    const page = announcement.pages.find((item) => item.key === 'accounts')!;
    const translate = jest.spyOn(I18n, 't');
    try {
      announcementPageBody(announcement, page);
      expect(translate).toHaveBeenCalledWith('news.pro_trial_accounts.accounts.body', {
        count: 6,
      });
    } finally {
      translate.mockRestore();
    }
  });
});
