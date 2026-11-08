import * as fs from 'fs';
import * as path from 'path';

import { PRO_LIMITS } from '~/constants/proLimits';
import {
  announcementPageBody,
  announcementPagesForPlatform,
  getFeatureAnnouncementById,
  getFeatureAnnouncementsNewestFirst,
  getLatestFeatureAnnouncement,
  getLatestUnseenFeatureAnnouncement,
  insightsCtaFocus,
  notificationReviewCtaTarget,
} from '~/features/news/featureAnnouncements';
import { MAX_RECEIPT_BATCH } from '~/features/transactions/lib/receiptScanBatch';
import { I18n } from '~/lib/i18n';
import {
  featureAnnouncementStateTestUtils,
  getLatestUnseenAnnouncementForUser,
  getSeenFeatureAnnouncementIds,
  markCurrentFeatureAnnouncementsSeen,
  markFeatureAnnouncementSeen,
} from '~/services/featureAnnouncementState';

const LOCALES_DIR = path.join(__dirname, '../../lib/i18n/locales');
const SUPPORTED_LOCALE_FILES = fs
  .readdirSync(LOCALES_DIR)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.replace(/\.ts$/, ''));
const loadLocale = (locale: string) => require(path.join(LOCALES_DIR, locale)).default as any;

const storage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(storage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    storage.set(key, value);
    return Promise.resolve();
  }),
}));

describe('feature announcement state', () => {
  beforeEach(() => {
    storage.clear();
  });

  it('sorts announcements newest first by numbered release order', () => {
    const announcements = getFeatureAnnouncementsNewestFirst();
    expect(announcements.length).toBeGreaterThan(0);
    expect(announcements[0].announcementNumber).toBe(
      getLatestFeatureAnnouncement()?.announcementNumber,
    );
  });

  it('announces period budgets, part paybacks, batch scans and archiving on both platforms', () => {
    const latest = getLatestFeatureAnnouncement()!;
    expect(latest).toMatchObject({
      id: 'budgets_splits_scans_archive_2026_11',
      announcementNumber: 25,
      pages: [
        { key: 'budgets', visual: 'periodBudgets', cta: 'openBudget' },
        { key: 'partPayments', visual: 'splitPartPayments', cta: 'openSettleUp' },
        { key: 'batchScan', visual: 'batchScan', cta: 'openScanReceipt' },
        { key: 'archive', visual: 'archiveAccounts', cta: 'openAccounts' },
      ],
    });
    expect(latest.requiresCapability).toBeUndefined();
    expect(announcementPagesForPlatform(latest, 'ios')).toHaveLength(4);
    expect(announcementPagesForPlatform(latest, 'android')).toHaveLength(4);
  });

  it('takes the batch scan limit in the new announcement from the scan code', () => {
    const latest = getFeatureAnnouncementById('budgets_splits_scans_archive_2026_11')!;
    const batchScan = latest.pages.find((page) => page.key === 'batchScan')!;
    const t = jest.spyOn(I18n, 't');
    announcementPageBody(latest, batchScan);
    expect(t).toHaveBeenCalledWith('news.budgets_splits_scans_archive.batchScan.body', {
      count: MAX_RECEIPT_BATCH,
    });
    t.mockRestore();
    // Every language takes the number as a placeholder, never as written text,
    // and writes the new announcement without dashes.
    for (const locale of SUPPORTED_LOCALE_FILES) {
      const news = loadLocale(locale).news.budgets_splits_scans_archive;
      expect([locale, news.batchScan.body]).toEqual([locale, expect.stringContaining('%{count}')]);
      expect([locale, JSON.stringify(news)]).toEqual([locale, expect.not.stringMatching(/[–—]/)]);
    }
  });

  it('names the real Scan receipt button in the batch scan page, in every language', () => {
    for (const locale of SUPPORTED_LOCALE_FILES) {
      const strings = loadLocale(locale);
      const body: string = strings.news.budgets_splits_scans_archive.batchScan.body;
      expect([locale, body]).toEqual([
        locale,
        expect.stringContaining(strings.add_action.scan_title),
      ]);
    }
  });

  it('says several budget periods need Pro only while the free plan allows one template', () => {
    // The budgets page says "Running several periods at once is part of Pro" in
    // every language. Raise the free limit and that sentence must change too.
    expect(PRO_LIMITS.FREE_MAX_BUDGET_TEMPLATES).toBe(1);
  });

  it('announces Cloud Sync, shared ledgers and Household insights on both platforms', () => {
    const latest = getFeatureAnnouncementById('cloud_sync_shared_ledgers_2026_11')!;
    expect(latest).toMatchObject({
      id: 'cloud_sync_shared_ledgers_2026_11',
      announcementNumber: 24,
      pages: [
        { key: 'cloudSync', visual: 'cloudSync', cta: 'openCloudSync' },
        { key: 'sharedLedgers', visual: 'sharedLedgers', cta: 'openLedgers' },
        // No button: Household only shows in a shared ledger, so Done it is.
        { key: 'household', visual: 'householdInsights' },
      ],
    });
    expect(latest.pages[2]?.cta).toBeUndefined();
    expect(latest.requiresCapability).toBeUndefined();
    expect(announcementPagesForPlatform(latest, 'ios')).toHaveLength(3);
    expect(announcementPagesForPlatform(latest, 'android')).toHaveLength(3);
  });

  it('writes the Cloud Sync announcement without dashes, in every language', () => {
    for (const locale of SUPPORTED_LOCALE_FILES) {
      const text = JSON.stringify(loadLocale(locale).news.cloud_sync_shared_ledgers);
      expect([locale, text]).toEqual([locale, expect.not.stringMatching(/[–—]/)]);
    }
  });

  it('announces auto-review, the Insights redesign and instalments on both platforms', () => {
    const latest = getFeatureAnnouncementById('auto_review_insights_instalments_2026_11')!;
    expect(latest).toMatchObject({
      id: 'auto_review_insights_instalments_2026_11',
      announcementNumber: 23,
      pages: [
        { key: 'autoReview', visual: 'autoReview', cta: 'openNotificationReview' },
        { key: 'insights', visual: 'insightsRedesign', cta: 'openInsights' },
        { key: 'instalments', visual: 'instalmentPlans', cta: 'openInstalments' },
      ],
    });
    expect(latest.requiresCapability).toBeUndefined();
    expect(announcementPagesForPlatform(latest, 'ios')).toHaveLength(3);
    expect(announcementPagesForPlatform(latest, 'android')).toHaveLength(3);
  });

  it('takes the free limits in the auto-review announcement from the plan limits', () => {
    const latest = getFeatureAnnouncementById('auto_review_insights_instalments_2026_11')!;
    const [autoReview, , instalments] = latest.pages;
    const t = jest.spyOn(I18n, 't');
    announcementPageBody(latest, autoReview);
    announcementPageBody(latest, instalments);
    expect(t).toHaveBeenCalledWith('news.auto_review_insights_instalments.autoReview.body', {
      count: PRO_LIMITS.FREE_MAX_NOTIFICATION_AI_REVIEWS,
    });
    expect(t).toHaveBeenCalledWith('news.auto_review_insights_instalments.instalments.body', {
      count: PRO_LIMITS.FREE_MAX_INSTALMENT_PLANS,
    });
    t.mockRestore();
    // Every language takes the number as a placeholder, never as written text.
    for (const locale of SUPPORTED_LOCALE_FILES) {
      const news = loadLocale(locale).news.auto_review_insights_instalments;
      expect(news.autoReview.body).toContain('%{count}');
      expect(news.instalments.body).toContain('%{count}');
    }
  });

  it('opens Breakdown for a free user and Trends, which is Pro, for a Pro user', () => {
    expect(insightsCtaFocus(false)).toBe('expense_breakdown');
    expect(insightsCtaFocus(true)).toBe('expense_trend');
  });

  it('opens notification review only when logging works, and its setup otherwise', () => {
    expect(notificationReviewCtaTarget({ reviewAvailable: true, loggingSetUp: true })).toBe(
      'review',
    );
    expect(notificationReviewCtaTarget({ reviewAvailable: true, loggingSetUp: false })).toBe(
      'setup',
    );
    // A build without the review service has no Auto-review card to land on.
    expect(notificationReviewCtaTarget({ reviewAvailable: false, loggingSetUp: true })).toBe(
      'setup',
    );
  });

  it('never says AI in the auto-review announcement, in any language', () => {
    // UI copy calls the feature Auto-review; AI and its translations stay out.
    const ai = /(^|[^\p{L}])(AI|KI|IA|ИИ|ШІ)([^\p{L}]|$)|人工智/u;
    for (const locale of SUPPORTED_LOCALE_FILES) {
      const news = loadLocale(locale).news;
      const strings = [
        JSON.stringify(news.auto_review_insights_instalments),
        news.cta.open_notification_review,
        news.cta.open_insights,
        news.cta.open_instalments,
      ];
      for (const text of strings)
        expect([locale, text]).toEqual([locale, expect.not.stringMatching(ai)]);
    }
  });

  it('kept announcement 22 to ledgers, from when Cloud Sync was allow-listed', () => {
    const announcement = getFeatureAnnouncementById('cloud_sync_ledgers_2026_10')!;
    expect(announcement).toMatchObject({
      announcementNumber: 22,
      pages: [{ key: 'ledgers', visual: 'ledgers', cta: 'openLedgers' }],
    });
    expect(announcementPagesForPlatform(announcement, 'ios')).toHaveLength(1);
    expect(announcementPagesForPlatform(announcement, 'android')).toHaveLength(1);
  });

  it('keeps all five web dashboard pages on both platforms', () => {
    const announcement = getFeatureAnnouncementById('web_dashboard_2026_10')!;
    expect(announcement.pages.map((page) => page.key)).toEqual([
      'webDashboard',
      'notificationReview',
      'fasterScans',
      'cardDesigns',
      'bottomBar',
    ]);
    expect(announcementPagesForPlatform(announcement, 'ios')).toHaveLength(5);
    expect(announcementPagesForPlatform(announcement, 'android')).toHaveLength(5);
  });

  it('keeps the transaction updates screenshot page on Android only', () => {
    const announcement = getFeatureAnnouncementById('transaction_updates_2026_10')!;
    expect(announcementPagesForPlatform(announcement, 'android').map((page) => page.key)).toEqual([
      'androidScreenshot',
      'accountLabels',
      'amountSearch',
    ]);
    expect(announcementPagesForPlatform(announcement, 'ios').map((page) => page.key)).toEqual([
      'accountLabels',
      'amountSearch',
    ]);
  });

  it('drops a platform-only page off that platform, keeping the rest', () => {
    const latest = getFeatureAnnouncementById('month_cycle_live_earnings_2026_09')!;
    // The Live Activity page is iOS only; the other three apply everywhere, so
    // the announcement itself must survive on Android rather than being gated.
    expect(announcementPagesForPlatform(latest, 'ios').map((page) => page.key)).toEqual([
      'monthCycle',
      'liveEarnings',
      'appIcon',
      'loanInterest',
    ]);
    expect(announcementPagesForPlatform(latest, 'android').map((page) => page.key)).toEqual([
      'monthCycle',
      'appIcon',
      'loanInterest',
    ]);
  });

  it('keeps every page of an announcement that gates none of them', () => {
    for (const announcement of getFeatureAnnouncementsNewestFirst()) {
      if (announcement.pages.some((page) => page.platform)) continue;
      expect(announcementPagesForPlatform(announcement, 'android')).toEqual(announcement.pages);
    }
  });

  it('only auto-selects the latest eligible announcement, not older unseen announcements', () => {
    const latest = getLatestFeatureAnnouncement();
    expect(latest).not.toBeNull();
    // Grant every capability so the newest announcement is eligible regardless of gating.
    const caps = { availableCapabilities: ['voice', 'autoLog'] as const, platformOS: 'ios' };
    expect(getLatestUnseenFeatureAnnouncement([], caps)?.id).toBe(latest?.id);
    expect(getLatestUnseenFeatureAnnouncement([latest!.id], caps)).toBeNull();
  });

  it('skips capability-gated announcements on devices without the capability', () => {
    // The catalog contains capability-gated announcements (voice, autoLog).
    const gatedCapabilities = getFeatureAnnouncementsNewestFirst()
      .filter((a) => a.requiresCapability)
      .map((a) => a.requiresCapability);
    expect(gatedCapabilities).toEqual(expect.arrayContaining(['voice', 'autoLog']));
    // With no capabilities available, the auto-popup never surfaces a gated announcement.
    const surfaced = getLatestUnseenFeatureAnnouncement([], { platformOS: 'ios' });
    expect(surfaced).not.toBeNull();
    expect(surfaced?.requiresCapability).toBeUndefined();
    // Android-like device: voice may exist but autoLog never does. The newest
    // (autoLog-gated) announcement is skipped and a supported one surfaces.
    const androidSurfaced = getLatestUnseenFeatureAnnouncement([], {
      availableCapabilities: ['voice'],
      platformOS: 'android',
    });
    expect(androidSurfaced).not.toBeNull();
    expect(androidSurfaced?.requiresCapability).not.toBe('autoLog');
  });

  it('never auto-selects an announcement with no page for this platform', () => {
    // The modal renders nothing for such an announcement, but the caller has
    // already marked the prompt visible — so it would never be dismissed, never
    // be marked seen, and would block the cloud-backup prompt for the session.
    for (const platformOS of ['ios', 'android']) {
      const surfaced = getLatestUnseenFeatureAnnouncement([], {
        availableCapabilities: ['voice', 'autoLog'],
        platformOS,
      });
      expect(surfaced).not.toBeNull();
      expect(announcementPagesForPlatform(surfaced!, platformOS).length).toBeGreaterThan(0);
    }
  });

  it('stores seen announcement ids per app user', async () => {
    await markFeatureAnnouncementSeen('user-a', 'feature-1');
    await markFeatureAnnouncementSeen('user-a', 'feature-1');
    await markFeatureAnnouncementSeen('user-b', 'feature-2');

    await expect(getSeenFeatureAnnouncementIds('user-a')).resolves.toEqual(['feature-1']);
    await expect(getSeenFeatureAnnouncementIds('user-b')).resolves.toEqual(['feature-2']);
  });

  it('silences existing announcements for a new user without affecting another user', async () => {
    await markCurrentFeatureAnnouncementsSeen('new-user');

    await expect(
      getLatestUnseenAnnouncementForUser('new-user', ['voice', 'autoLog'], 'ios'),
    ).resolves.toBeNull();
    await expect(
      getLatestUnseenAnnouncementForUser('returning-user', ['voice', 'autoLog'], 'ios'),
    ).resolves.toMatchObject({ id: getLatestFeatureAnnouncement()?.id });
    expect(await getSeenFeatureAnnouncementIds('new-user')).toHaveLength(
      getFeatureAnnouncementsNewestFirst().length,
    );
  });

  it('returns the latest unseen announcement for a user until it is marked seen', async () => {
    const latest = getLatestFeatureAnnouncement();
    expect(latest).not.toBeNull();

    await expect(
      getLatestUnseenAnnouncementForUser('user-a', ['voice', 'autoLog'], 'ios'),
    ).resolves.toMatchObject({
      id: latest!.id,
    });

    await markFeatureAnnouncementSeen('user-a', latest!.id);
    await expect(
      getLatestUnseenAnnouncementForUser('user-a', ['voice', 'autoLog'], 'ios'),
    ).resolves.toBeNull();
  });

  it('ignores corrupted seen-state payloads', () => {
    expect(featureAnnouncementStateTestUtils.parseSeenIds('{bad json')).toEqual([]);
    expect(featureAnnouncementStateTestUtils.parseSeenIds(JSON.stringify([1, 'valid']))).toEqual([
      'valid',
    ]);
  });
});
