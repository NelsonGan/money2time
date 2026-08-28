import { homeWidgetsAnnouncement } from './001_home_widgets';
import { voiceTransactionsAnnouncement } from './002_voice_transactions';
import { shareEarnAnnouncement } from './003_share_earn';
import { accountLogosAnnouncement } from './004_account_logos';
import { multiCurrencyAnnouncement } from './005_multi_currency';
import { calendarAlbumsAnnouncement } from './006_calendar_albums';
import { budgetItemsAnnouncement } from './007_budget_items';
import { receiptSplitAnnouncement } from './008_receipt_split';
import { automationsAnnouncement } from './009_automations';
import { savingsGoalsAnnouncement } from './010_savings_goals';
import { googleDriveBackupAnnouncement } from './011_google_drive_backup';
import { iconStyleAnnouncement } from './012_icon_style';
import { reviewSpendingAnnouncement } from './013_review_spending';
import { loansWorkdaysFxMascotsAnnouncement } from './014_loans_workdays_fx_mascots';
import { subscriptionsTutorialsLoansAnnouncement } from './015_subscriptions_tutorials_loans';

export const FEATURE_ANNOUNCEMENTS = [
  homeWidgetsAnnouncement,
  voiceTransactionsAnnouncement,
  shareEarnAnnouncement,
  accountLogosAnnouncement,
  multiCurrencyAnnouncement,
  calendarAlbumsAnnouncement,
  budgetItemsAnnouncement,
  receiptSplitAnnouncement,
  automationsAnnouncement,
  savingsGoalsAnnouncement,
  googleDriveBackupAnnouncement,
  iconStyleAnnouncement,
  reviewSpendingAnnouncement,
  loansWorkdaysFxMascotsAnnouncement,
  subscriptionsTutorialsLoansAnnouncement,
] as const;
