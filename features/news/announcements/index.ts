import { homeWidgetsAnnouncement } from './001_home_widgets';
import { voiceTransactionsAnnouncement } from './002_voice_transactions';
import { shareEarnAnnouncement } from './003_share_earn';

export const FEATURE_ANNOUNCEMENTS = [
  homeWidgetsAnnouncement,
  voiceTransactionsAnnouncement,
  shareEarnAnnouncement,
] as const;
