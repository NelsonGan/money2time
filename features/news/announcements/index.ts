import { homeWidgetsAnnouncement } from './001_home_widgets';
import { voiceTransactionsAnnouncement } from './002_voice_transactions';
import { shareEarnAnnouncement } from './003_share_earn';
import { accountLogosAnnouncement } from './004_account_logos';
import { multiCurrencyAnnouncement } from './005_multi_currency';

export const FEATURE_ANNOUNCEMENTS = [
  homeWidgetsAnnouncement,
  voiceTransactionsAnnouncement,
  shareEarnAnnouncement,
  accountLogosAnnouncement,
  multiCurrencyAnnouncement,
] as const;
