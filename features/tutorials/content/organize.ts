import type { Tutorial } from './types';

export const ORGANIZE_TUTORIALS: Tutorial[] = [
  {
    id: 'accounts',
    category: 'organize',
    title: 'Set up your accounts',
    summary: 'Add your bank, cash, and cards, then group them so the list stays readable.',
    keywords: ['account', 'wallet', 'bank', 'credit card', 'balance', 'group', 'logo'],
    steps: [
      {
        image: 'accounts-1',
        title: 'See where you stand',
        body: 'The Accounts tab totals everything you own and everything you owe into one net figure.',
      },
      {
        image: 'accounts-2',
        title: 'Open Accounts in Settings',
        body: 'This is where you add, rename, reorder, and hide accounts.',
      },
      {
        image: 'accounts-6',
        title: 'Add one',
        body: 'The plus in the top right. The free plan includes five accounts.',
      },
      {
        image: 'accounts-4',
        title: 'Fill in the details',
        body: 'Debit for cash and current accounts, Credit for cards, Loan for money you owe. Set the starting balance so the running total is right.',
      },
      {
        image: 'accounts-7',
        title: 'Give it a logo',
        body: 'Search around 500 banks and wallets, or upload your own. The flag button switches country.',
      },
      {
        image: 'accounts-3',
        title: 'Group them',
        body: 'Everyday, Savings, Credit. Drag the handle on the left to reorder, and use a group plus to add straight into it.',
      },
      {
        image: 'accounts-5',
        title: 'Groups follow you around',
        body: 'The same headings show up whenever you pick an account, so a long list stays easy to scan.',
      },
    ],
  },
  {
    id: 'categories',
    category: 'organize',
    title: 'Shape your categories',
    summary: 'Rename, add, and nest categories so the charts match how you think.',
    keywords: ['category', 'subcategory', 'icon', 'emoji', 'rename', 'parent', 'tag'],
    steps: [
      {
        image: 'categories-1',
        title: 'Open Categories',
        body: 'Settings, then Categories. Expense and income have separate lists.',
      },
      {
        image: 'categories-2',
        title: 'Add one',
        body: 'The plus in the top right. The free plan includes nine categories.',
      },
      {
        image: 'categories-3',
        title: 'Nest it under a parent',
        body: 'Leave Parent empty for a top-level category. Pick one and it becomes a subcategory, which keeps the charts tidy.',
      },
      {
        image: 'categories-4',
        title: 'Pick an icon',
        body: 'Icons are the illustrated set, Emoji is any emoji on your phone, Custom is an image you upload. Search by name.',
      },
      {
        image: 'categories-5',
        title: 'Expand and reorder',
        body: 'The chevron opens a category. The plus on a row adds a subcategory, the handle drags it into place.',
      },
      {
        image: 'categories-6',
        title: 'Subcategories show while you log',
        body: 'The picker in the entry screen opens the parent, then the children, so filing something takes two taps.',
      },
    ],
  },
  {
    id: 'recurring',
    category: 'organize',
    title: 'Track subscriptions and bills',
    summary: 'Set up anything that repeats and let it log itself on the day.',
    keywords: [
      'recurring',
      'subscription',
      'bill',
      'monthly',
      'repeat',
      'rent',
      'salary',
      'netflix',
    ],
    steps: [
      {
        image: 'recurring-1',
        title: 'Open Recurring transactions',
        body: 'Settings, then Recurring transactions.',
      },
      {
        image: 'recurring-2',
        title: 'See the monthly damage',
        body: 'The card at the top adds up everything that repeats. The list below shows when each one is next due.',
      },
      {
        image: 'recurring-3',
        title: 'Add a rule',
        body: 'The plus in the top right. It is the same form as a normal entry, with a date and an amount. The free plan includes five rules.',
      },
      {
        image: 'recurring-4',
        title: 'Give it a brand',
        body: 'Type the name and the logo fills in on its own. Tap Logo to change it or upload your own.',
      },
      {
        image: 'recurring-5',
        title: 'Set how often',
        body: 'Daily, weekly, monthly, or yearly, with an interval. Every 3 months means quarterly. Ends can be a date or never.',
      },
      {
        image: 'recurring-6',
        title: 'It logs itself',
        body: 'On the due date the entry appears on your calendar, ready to edit if the amount changed.',
      },
    ],
  },
  {
    id: 'albums',
    category: 'organize',
    title: 'Group a trip into an album',
    summary: 'Pull a holiday or project together and see what it cost as one number.',
    keywords: ['album', 'trip', 'holiday', 'vacation', 'travel', 'project', 'event', 'map'],
    steps: [
      {
        image: 'albums-1',
        title: 'Open the Albums tab',
        body: 'Tap the plus in the top right to start one. The free plan includes three albums.',
      },
      {
        image: 'albums-2',
        title: 'Name it and add a cover',
        body: 'A photo from your library makes the album easy to spot later. Dates are optional.',
      },
      {
        image: 'albums-3',
        title: 'Attach a place',
        body: 'Search any city, state, or country. It works offline, and it puts the album on the map.',
      },
      {
        image: 'albums-4',
        title: 'Pick the transactions',
        body: 'Tick anything that belongs to the trip. You can add more at any time.',
      },
      {
        image: 'albums-5',
        title: 'See what it cost',
        body: 'The album totals itself and breaks the spend down by category. Transactions lists every entry.',
      },
      {
        image: 'albums-7',
        title: 'Let it fill itself',
        body: 'Set Auto-add new transactions to this album and everything you log lands in it until you switch it off.',
      },
      {
        image: 'albums-6',
        title: 'View them on a map',
        body: 'The Map tab pins every album that has a place, with its name and total.',
      },
    ],
  },
  {
    id: 'items',
    category: 'organize',
    title: 'See what a thing costs per day',
    summary: 'Log a purchase once and watch the cost per day fall the longer you keep it.',
    keywords: ['item', 'cost per day', 'purchase', 'value', 'worth it', 'ownership', 'gear'],
    steps: [
      {
        image: 'items-1',
        title: 'Open the Items tab',
        body: 'It sits next to Accounts and Goals. The free plan includes five items.',
      },
      {
        image: 'items-2',
        title: 'Enter what you paid',
        body: 'Name, price, and the date you bought it. That date is what the daily cost is measured from.',
      },
      {
        image: 'items-3',
        title: 'Pick an icon',
        body: 'Search the library or upload a photo of the thing itself.',
      },
      {
        image: 'items-4',
        title: 'Watch it get cheaper',
        body: 'An $850 machine kept for 196 days costs $4.34 a day, and that number keeps falling.',
      },
      {
        image: 'items-5',
        title: 'Retire it when it goes',
        body: 'Mark as inactive when you sell it or stop using it. The day count freezes instead of running forever.',
      },
    ],
  },
  {
    id: 'multi-currency',
    category: 'organize',
    title: 'Spend in another currency',
    summary: 'Track a second currency and keep your totals in one place.',
    keywords: ['currency', 'exchange rate', 'foreign', 'fx', 'travel money', 'conversion'],
    steps: [
      {
        image: 'multi-currency-1',
        title: 'Open Multi currency',
        body: 'Settings, then Multi currency.',
      },
      {
        image: 'multi-currency-2',
        title: 'Confirm your main currency',
        body: 'Every chart and total is reported in this one. Everything else converts into it.',
      },
      {
        image: 'multi-currency-3',
        title: 'Add the one you need',
        body: 'Tap Add and choose it. The free plan includes one extra currency.',
      },
      {
        image: 'multi-currency-4',
        title: 'Keep rates fresh',
        body: 'Update rates pulls the latest. You can also tap a currency and type a rate yourself.',
      },
      {
        image: 'multi-currency-5',
        title: 'Log in either one',
        body: 'The entry screen gets a currency button. The rate is saved with the entry, so old totals never drift when rates move.',
      },
    ],
  },
  {
    id: 'financial-month',
    category: 'organize',
    title: 'Start your month on payday',
    summary: 'If you are paid on the 25th, make your month run from the 25th.',
    keywords: [
      'payday',
      'first day of month',
      'cycle',
      'salary date',
      'budget period',
      'week start',
    ],
    steps: [
      {
        image: 'financial-month-1',
        title: 'Open Display',
        body: 'Settings, then Display. The two day settings are near the bottom.',
      },
      {
        image: 'financial-month-2',
        title: 'Find First day of month',
        body: 'It is set to 1 by default, which is the normal calendar month.',
      },
      {
        image: 'financial-month-3',
        title: 'Pick your payday',
        body: 'Choose any day from 1 to 28. Calendar months, budgets, and reviews all shift to match, and a month is named after the month it starts in.',
      },
    ],
  },
  {
    id: 'credit-cards',
    category: 'organize',
    title: 'Track a credit card',
    summary: 'Set the statement and due days, then pay the card off in one tap.',
    keywords: ['credit card', 'statement', 'due date', 'billing cycle', 'pay card', 'minimum'],
    steps: [
      {
        image: 'credit-cards-1',
        title: 'Open the card',
        body: 'Settings, then Accounts. A card is an account with the Credit type.',
      },
      {
        image: 'credit-cards-2',
        title: 'Enter the two days',
        body: 'Statement day is when the bill is cut, due day is when it has to be paid. Both are on your last statement.',
      },
      {
        image: 'credit-cards-3',
        title: 'They show up on the card',
        body: 'The Accounts tab now says when the statement closes and when payment is due, so neither has to live in your head.',
      },
      {
        image: 'credit-cards-4',
        title: 'Tap Pay when you settle it',
        body: 'Expand the card. Balance payable is what the closed statement owes, outstanding is what has been spent since.',
      },
      {
        image: 'credit-cards-5',
        title: 'Confirm the payment',
        body: 'The amount is filled in for you. It records as a transfer from the account you pay with, so it is not counted as spending twice.',
      },
    ],
  },
];
