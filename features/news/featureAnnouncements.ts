import { I18n } from '~/lib/i18n';

import { FEATURE_ANNOUNCEMENTS } from './announcements';

/** Device capabilities an announcement can be gated on for the auto-popup. */
export type AnnouncementCapability = 'voice' | 'autoLog';

export interface FeatureAnnouncementPage {
  /** Page content key — copy resolves from `news.<announcement.i18nKey>.<key>`. */
  key: string;
  accent: 'primary' | 'success' | 'warning' | 'error' | 'lavender' | 'sky';
  visual?:
    | 'monthly'
    | 'quickAdd'
    | 'weekly'
    | 'calendar'
    | 'albums'
    | 'savings'
    | 'savingsHistory'
    | 'voice'
    | 'shareEarn'
    | 'accountLogos'
    | 'multiCurrency'
    | 'redesign'
    | 'appLock'
    | 'budget'
    | 'items'
    | 'receiptSplit'
    | 'addSplitSelector'
    | 'autoLog'
    | 'goals'
    | 'financialMonth'
    | 'excelExport'
    | 'backup'
    | 'iconStyle'
    | 'review'
    | 'loanAccount'
    | 'workingDays'
    | 'transactionFx'
    | 'mascots'
    | 'subscriptionLogos'
    | 'recurringForecast'
    | 'tutorials'
    | 'loanInstalment'
    | 'monthCycle'
    | 'liveEarnings'
    | 'appIcon'
    | 'loanInterest';
  /**
   * Optional call-to-action for this page. On the last page it replaces the
   * primary button; on earlier pages it sits above the Back/Next row so the
   * pager still works.
   */
  cta?:
    | 'openShareEarn'
    | 'openQuickEntrySettings'
    | 'openAutoLog'
    | 'openFirstDayOfMonth'
    | 'openExcelExport'
    | 'openAutoBackup'
    | 'openIconStyle'
    | 'openReview'
    | 'openAccounts'
    | 'openHourlyValueSettings'
    | 'openAddTransaction'
    | 'openRecurring'
    | 'openTutorials'
    | 'openLiveEarnings'
    | 'openAppIcon';
  /**
   * Restrict this page to one platform. A page for a feature the other platform
   * cannot have (a Live Activity is iOS only) is dropped from the pager rather
   * than gating the whole announcement, which would hide the pages that do
   * apply. Filter with `announcementPagesForPlatform`.
   */
  platform?: 'ios' | 'android';
  /**
   * Interrupt a dismissal of this page with a confirmation, so the user has to
   * knowingly walk past it. `'backup'` reuses the onboarding backup warning and
   * only fires while the user has no cloud backup target (see the modal).
   */
  confirmDismiss?: 'backup';
  /**
   * Hide the "PRO" ribbon on the widget showcase. Use when a widget visual is
   * reused to illustrate an in-app (non-Pro) feature, e.g. the calendar home.
   */
  hidePro?: boolean;
}

export interface FeatureAnnouncement {
  id: string;
  /** i18n namespace for this announcement's copy under `news.<i18nKey>`. */
  i18nKey: string;
  releaseDate: string;
  announcementNumber: number;
  pages: FeatureAnnouncementPage[];
  /**
   * When set, the auto-popup only fires for users whose device supports this
   * capability. A 'voice'-gated announcement is still always listed in the
   * News screen; an 'autoLog'-gated one is also dropped from the News list on
   * devices that cannot run the iOS Shortcuts automations (see NewsScreen).
   */
  requiresCapability?: AnnouncementCapability;
}

/** Localized title shown in the News list and announcement summaries. */
export function announcementTitle(announcement: FeatureAnnouncement): string {
  return I18n.t(`news.${announcement.i18nKey}.title`);
}

/** Localized title for a single announcement page. */
export function announcementPageTitle(
  announcement: FeatureAnnouncement,
  page: FeatureAnnouncementPage,
): string {
  return I18n.t(`news.${announcement.i18nKey}.${page.key}.title`);
}

/** Localized body copy for a single announcement page. */
export function announcementPageBody(
  announcement: FeatureAnnouncement,
  page: FeatureAnnouncementPage,
): string {
  return I18n.t(`news.${announcement.i18nKey}.${page.key}.body`);
}

/**
 * The pages of an announcement that apply to the running platform.
 *
 * The platform is passed in rather than read from `react-native` here so this
 * module stays free of native imports and testable under the node environment.
 */
export function announcementPagesForPlatform(
  announcement: FeatureAnnouncement,
  platformOS: string,
): FeatureAnnouncementPage[] {
  return announcement.pages.filter((page) => !page.platform || page.platform === platformOS);
}

/** Localized label for a page call-to-action button. */
export function announcementCtaLabel(cta: NonNullable<FeatureAnnouncementPage['cta']>): string {
  switch (cta) {
    case 'openQuickEntrySettings':
      return I18n.t('news.cta.open_quick_entry_settings');
    case 'openAutoLog':
      return I18n.t('news.cta.open_auto_log');
    case 'openFirstDayOfMonth':
      return I18n.t('news.cta.open_first_day_of_month');
    case 'openExcelExport':
      return I18n.t('news.cta.open_excel_export');
    case 'openAutoBackup':
      return I18n.t('news.cta.open_auto_backup');
    case 'openIconStyle':
      return I18n.t('news.cta.open_icon_style');
    case 'openReview':
      return I18n.t('news.cta.open_review');
    case 'openAccounts':
      return I18n.t('news.cta.open_accounts');
    case 'openHourlyValueSettings':
      return I18n.t('news.cta.open_hourly_value_settings');
    case 'openAddTransaction':
      return I18n.t('news.cta.open_add_transaction');
    case 'openRecurring':
      return I18n.t('news.cta.open_recurring');
    case 'openTutorials':
      return I18n.t('news.cta.open_tutorials');
    case 'openLiveEarnings':
      return I18n.t('news.cta.open_live_earnings');
    case 'openAppIcon':
      return I18n.t('news.cta.open_app_icon');
    case 'openShareEarn':
    default:
      return I18n.t('news.cta.open_share_earn');
  }
}

export { FEATURE_ANNOUNCEMENTS } from './announcements';

export function getFeatureAnnouncementsNewestFirst() {
  return [...FEATURE_ANNOUNCEMENTS].sort((a, b) => {
    const byDate = b.releaseDate.localeCompare(a.releaseDate);
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });
}

export function getLatestFeatureAnnouncement() {
  return getFeatureAnnouncementsNewestFirst()[0] ?? null;
}

export function getFeatureAnnouncementById(id: string) {
  return FEATURE_ANNOUNCEMENTS.find((announcement) => announcement.id === id) ?? null;
}

export function getLatestUnseenFeatureAnnouncement(
  seenIds: readonly string[],
  options: {
    availableCapabilities?: readonly AnnouncementCapability[];
    /**
     * Required rather than optional so a caller cannot silently opt out of the
     * platform check below: an announcement the popup opens but cannot draw is
     * unrecoverable for the session (see the comment on the filter).
     */
    platformOS: string;
  },
) {
  const seen = new Set(seenIds);
  const available = new Set(options.availableCapabilities ?? []);
  // Only consider announcements the user is eligible to see — a capability-gated
  // announcement is skipped (along with anything older it would shadow) on
  // devices that lack the capability, so the auto-popup never surfaces it there.
  //
  // An announcement whose every page is gated to the other platform is skipped
  // for the same reason, and this is the load-bearing half: the modal renders
  // nothing for one, but the caller has already marked the prompt visible, so
  // it would never be dismissed, never be marked seen, and would block the
  // cloud-backup prompt for the rest of the session.
  const latestEligible = getFeatureAnnouncementsNewestFirst().find(
    (announcement) =>
      (!announcement.requiresCapability || available.has(announcement.requiresCapability)) &&
      announcementPagesForPlatform(announcement, options.platformOS).length > 0,
  );
  if (!latestEligible) return null;
  return seen.has(latestEligible.id) ? null : latestEligible;
}
