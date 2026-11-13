import type { LocaleModule } from './types';

/**
 * English — canonical source. Every other locale is a translation of this
 * module. Numeric / currency / date tokens here are reused verbatim by all
 * locales because every locale renders on top of the English screenshots.
 */
const en: LocaleModule = {
  meta: { code: 'en', flag: '🇺🇸', label: 'English' },

  phone: {
    s1:  { h: 'Every Row,\nin Hours.', hl: 'in Hours.', sh: 'Your ledger speaks dollars and time', she: '⏳', price: '$10.10', time: '23m', timeSub: 'of work' },
    s2:  { h: 'All Your Money.\nOne Place.', hl: 'One Place.', sh: 'Net worth, savings, credit — all in view', she: '💚', netWorth: '$55,931', netWorthLabel: 'Net Worth', checking: 'Daily Checking', checkingSub: 'Everyday', checkingValue: '$31,079', savings: 'High Yield Savings', savingsSub: 'Goals', savingsValue: '$15,004' },
    s3:  { h: 'See Every Day\nat a Glance', hl: 'at a Glance', sh: 'Visual calendar of your spending', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Spent today', amount: '$76.55', food: 'Food', shopping: 'Shopping', transport: 'Transit' },
    s4:  { h: 'Where Does\nYour Money Go?', hl: 'Money Go?', sh: 'Beautiful charts break it all down', she: '🥧', home: 'Home  59%', travel: 'Food  22%', food: 'Transport  9%', total: 'Total Expense', totalValue: '$2,899.22' },
    s5:  { h: 'Every Dollar\nis Your Time', hl: 'Your Time', sh: 'See exactly how long you worked for it', she: '⏰', time: '112h 24m', timeLabel: 'this month', money: '$2,899.22' },
    s6:  { h: 'What\'s Your\nSavings Rate?', hl: 'Savings Rate?', sh: 'Track every month. Build the habit', she: '📊', healthy: '20%+ is healthy', income: 'Income', expense: 'Expense', saved: 'Saved' },
    s7:  { h: 'Track Spending\nin Seconds', hl: 'in Seconds', sh: 'Quick entry from the home screen', she: '⚡', saved: 'Saved!', quick: 'Quick add', mood: '~15m of work' },
    s8:  { h: 'Split\nthe Bill', hl: 'the Bill', sh: 'Split bills, mood, notes — your call', she: '✍️', splitBill: 'Split Bill', mood: 'Mood', note: 'Notes' },
    s9:  { h: 'What Do You\nReally Earn?', hl: 'Really Earn?', sh: 'Per-month hourly rate, updated as you go', she: '💡', rate: '$25.79', perHour: 'per hour', revealed: 'Latest rate', current: 'May 2026 — current' },
    s10: { h: 'Subscriptions\nUnder Control', hl: 'Under Control', sh: 'Rent, memberships, recurring bills', she: '🔁', total: '$1,556.99 / mo', rent: 'Apartment Rent', gym: 'Gym Membership', streaming: 'Streaming Bundle' },
    s11: { h: 'Make It\nYours', hl: 'Yours', sh: 'Personalize every corner of the app', she: '⚙️', display: 'Display', hourly: 'Hourly value', categories: 'Categories' },
    s12: { h: 'Pick Your\nVibe', hl: 'Vibe', sh: 'Language, currency, and theme — your way', she: '🎨', language: 'English (en)', currency: 'USD ($)', theme: 'Light · Sage' },
    s13: { h: 'Import\nin a Tap', hl: 'in a Tap', sh: 'AI reads your statement. You confirm', she: '🤖', aiPowered: 'AI-powered', oneTap: 'Copy Prompt', pasteJSON: 'Paste JSON' },
    s14: { h: 'Type.\nTap. Done.', hl: 'Done.', sh: 'Your keyboard is the fastest way in', she: '⌨️', type: 'Coffee 6.50', tap: '↵', done: '0m to log', category: 'Auto · Food / Coffee' },
    s15: {
      h: 'Your Data\nStays Yours.', hl: 'Stays Yours.',
      privacy: 'Private by design', privacySub: 'Stored on your phone. Sync is optional.',
      noAds: 'No ads', noAdsSub: 'Zero distractions. Just your finances.',
      local: 'Local first', localSub: 'Works offline. No account needed.',
      users: '70K+ Users',
      inspiredPre: 'Inspired by',
      bookSub: 'Money is the life energy you trade for it',
    },
    s16: { h: 'Set Budgets.\nStay on Track.', hl: 'Stay on Track.', sh: 'Every category, always in view', she: '🎯', ring: '80%', left: '$730.85 left', budgeted: 'Budgeted spend', unbudgeted: 'Unbudgeted spend' },
  },

  feature: {
    titleA: 'Every dollar you spend',
    titleB: { pre: 'is ', hl: 'hours', post: ' of your life.' },
    sub: 'See your true hourly rate',
  },

  landing: {
    title: 'Your $5 coffee just cost 12 minutes of life.',
    highlight: '12 minutes',
    subtitle: 'See the real time-price of every purchase.',
  },
};

export default en;
