import type { Tutorial } from './types';

export const START_TUTORIALS: Tutorial[] = [
  {
    id: 'getting-started',
    category: 'start',
    title: 'Set up Money2Time',
    summary: 'Seven short steps from opening the app to logging your first expense.',
    keywords: ['onboarding', 'first time', 'new user', 'setup', 'welcome', 'install'],
    steps: [
      {
        image: 'getting-started-1',
        title: 'See the idea first',
        body: 'Money2Time shows every amount twice: what it cost, and how long you worked for it. A $25 morning is also 1h 40m.',
      },
      {
        image: 'getting-started-2',
        title: 'Set the basics',
        body: 'Language, currency, and a theme color. Money2Time guesses these from your phone, so usually you can just tap Continue.',
      },
      {
        image: 'getting-started-3',
        title: 'Try it out',
        body: 'Type any amount and watch it turn into hours. This is the number that shows up next to everything you log.',
      },
      {
        image: 'getting-started-4',
        title: 'Turn on backup',
        body: 'Your data stays on your phone. A backup is the only thing that gets it onto a new one, so turn it on now.',
      },
      {
        image: 'getting-started-5',
        title: 'Start tracking',
        body: 'That is it. The calendar becomes your home screen, and the orange plus adds your first entry.',
      },
    ],
  },
  {
    id: 'see-prices-in-hours',
    category: 'start',
    title: 'See prices in work hours',
    summary: 'Tell the app what you earn, then read any amount as time instead of money.',
    keywords: ['time', 'hourly', 'wage', 'salary', 'pay', 'true hourly rate', 'money mode'],
    steps: [
      {
        image: 'see-prices-in-hours-1',
        title: 'Open Hourly value',
        body: 'Settings, then Hourly value. This is where the app learns what an hour of yours is worth.',
      },
      {
        image: 'see-prices-in-hours-2',
        title: 'Read your true hourly rate',
        body: 'The big number at the top is what you actually earn per hour. The timeline below tracks how it has moved month to month.',
      },
      {
        image: 'see-prices-in-hours-3',
        title: 'Enter what you earn',
        body: 'Hourly, monthly, or yearly. Use your after-tax pay, the figure that really lands in your account.',
      },
      {
        image: 'see-prices-in-hours-4',
        title: 'Add the hidden hours',
        body: 'Getting ready, commuting, parking, unpaid overtime. Counting them gives you a true hourly rate, which is usually lower than the one on your contract.',
      },
      {
        image: 'see-prices-in-hours-5',
        title: 'Flip the whole app to time',
        body: 'Tap the clock in the header. Every amount on screen becomes hours and minutes.',
      },
      {
        image: 'see-prices-in-hours-6',
        title: 'Read the month in hours',
        body: 'Income and expenses both switch. A $200 dinner reads as 7h 45m, which is a lot harder to ignore.',
      },
    ],
  },
  {
    id: 'find-your-way-around',
    category: 'start',
    title: 'Find your way around',
    summary: 'What each of the five tabs at the bottom is for.',
    keywords: ['tabs', 'navigation', 'home', 'menu', 'where is', 'layout'],
    steps: [
      {
        image: 'find-your-way-around-1',
        title: 'Calendar is home',
        body: 'A month at a glance, with each day showing what went in and out. Everything you log lands here.',
      },
      {
        image: 'find-your-way-around-2',
        title: 'Accounts holds your money',
        body: 'Balances, savings goals, and the things you own. Net assets sit at the top.',
      },
      {
        image: 'find-your-way-around-3',
        title: 'Insights explains it',
        body: 'Charts for where the money went, how the month is pacing, and what your budget has left.',
      },
      {
        image: 'find-your-way-around-4',
        title: 'Albums groups a trip',
        body: 'Pull a holiday or a project into its own album and see what it cost as one number.',
      },
      {
        image: 'find-your-way-around-5',
        title: 'Settings has the rest',
        body: 'Categories, recurring bills, backup, and every switch in the app. Your tracking stats sit at the top.',
      },
    ],
  },
  {
    id: 'change-how-it-looks',
    category: 'start',
    title: 'Change how the app looks',
    summary: 'Theme, colors, icon style, and app icon, all on one screen.',
    keywords: [
      'theme',
      'dark mode',
      'color',
      'appearance',
      'icon',
      'personalize',
      'customize',
      'personalise',
      'customise',
    ],
    steps: [
      {
        image: 'change-how-it-looks-1',
        title: 'Open Display',
        body: 'Settings, then Display. Everything about how the app looks lives here.',
      },
      {
        image: 'change-how-it-looks-2',
        title: 'Pick light or dark',
        body: 'System follows your phone. Light and dark pin it, whatever the phone is doing.',
      },
      {
        image: 'change-how-it-looks-3',
        title: 'Choose a theme color',
        body: 'Eight palettes. The color carries through buttons, charts, and highlights.',
      },
      {
        image: 'change-how-it-looks-4',
        title: 'Clay or flat icons',
        body: 'Clay is the soft illustrated set. Flat swaps in thin line icons if you prefer something quieter.',
      },
      {
        image: 'change-how-it-looks-5',
        title: 'Change the app icon',
        body: 'Nine icons for your home screen. Classic is free, the rest come with Pro.',
      },
    ],
  },
  {
    id: 'simple-or-power',
    category: 'start',
    title: 'Simple or Power mode',
    summary: 'One wallet and one list, or full accounts and transfers. Switch whenever.',
    keywords: ['simple mode', 'power mode', 'wallet', 'switch mode', 'beginner', 'advanced'],
    steps: [
      {
        image: 'simple-or-power-1',
        title: 'Open Personalize',
        body: 'Settings, then Personalize, under MONEY.',
      },
      {
        image: 'simple-or-power-2',
        title: 'Pick your depth',
        body: 'Simple keeps one wallet and hides the accounts tab, which is plenty if you just want to know what you spent. Power adds accounts, transfers, and balances. Your entries survive the switch either way.',
      },
    ],
  },
  {
    id: 'notifications',
    category: 'start',
    title: 'Turn on reminders',
    summary: 'A nudge to log, and a recap when the week or month closes.',
    keywords: ['notification', 'reminder', 'alert', 'daily', 'weekly', 'monthly', 'push', 'nudge'],
    steps: [
      {
        image: 'notifications-1',
        title: 'Open Notifications',
        body: 'Settings, then Notifications, under PREFERENCES.',
      },
      {
        image: 'notifications-2',
        title: 'Choose what reaches you',
        body: 'A daily nudge to log, an alert when a recurring entry is created for you, and a recap of the week and month as each one closes. Send test notification shows you what it looks like.',
      },
      {
        image: 'notifications-3',
        title: 'Set the time',
        body: 'Customize on any row picks the hour. Put the daily reminder where your day actually ends, not where you wish it did.',
      },
    ],
  },
  {
    id: 'update-your-pay',
    category: 'start',
    title: 'Update your pay after a raise',
    summary: 'Add a new month so old entries keep the rate you earned back then.',
    keywords: ['raise', 'salary change', 'new job', 'pay rise', 'wage history', 'month', 'rate'],
    steps: [
      {
        image: 'update-your-pay-1',
        title: 'Open Hourly value',
        body: 'Settings, then Hourly value.',
      },
      {
        image: 'update-your-pay-2',
        title: 'Add the month it changed',
        body: 'The timeline holds one rate per month. Tap the plus rather than editing an old entry, so last year stays measured at last year\u2019s pay.',
      },
      {
        image: 'update-your-pay-3',
        title: 'Enter the new figure',
        body: 'Same short flow as setup. From that month on, every amount converts at the new rate, and the timeline shows the jump.',
      },
    ],
  },
];
