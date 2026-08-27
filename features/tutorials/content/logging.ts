import type { Tutorial } from './types';

export const LOGGING_TUTORIALS: Tutorial[] = [
  {
    id: 'log-an-expense',
    category: 'logging',
    title: 'Log an expense in seconds',
    summary: 'The fastest path: plus, amount, done.',
    keywords: ['add', 'expense', 'spend', 'quick entry', 'keypad', 'new transaction'],
    steps: [
      {
        image: 'log-an-expense-1',
        title: 'Tap the orange plus',
        body: 'It sits above the tab bar on every screen, so you never have to go looking for it.',
      },
      {
        image: 'log-an-expense-2',
        title: 'Choose Quick entry',
        body: 'One keypad, one line. Full entry is there when you need splits, receipts, or a different account.',
      },
      {
        image: 'log-an-expense-3',
        title: 'Type the amount and a note',
        body: 'The line under the amount shows the account, the category, and what it cost in work time. Tap any of them to change it.',
      },
      {
        image: 'log-an-expense-4',
        title: 'It lands on the calendar',
        body: 'Your entry appears at the top of the day. Tap it any time to edit or delete it.',
      },
    ],
  },
  {
    id: 'the-add-button',
    category: 'logging',
    title: 'Set up the plus button',
    summary: 'Make the plus open your favorite entry screen, and pre-pick a category.',
    keywords: ['plus', 'fab', 'shortcut', 'default account', 'quick entry settings', 'add button'],
    steps: [
      {
        image: 'the-add-button-1',
        title: 'Open the sheet settings',
        body: 'Tap the plus, then the small gear on the right of the sheet.',
      },
      {
        image: 'the-add-button-2',
        title: 'Skip the menu',
        body: 'Turn off "Show options when adding" and the plus goes straight to one entry screen instead of asking first.',
      },
      {
        image: 'the-add-button-3',
        title: 'Pre-pick a category',
        body: 'Give each shortcut a category. Tap Food and the amount is already filed before you type it.',
      },
    ],
  },
  {
    id: 'transfers',
    category: 'logging',
    title: 'Move money between accounts',
    summary: 'Record a transfer so neither side counts as spending.',
    keywords: ['transfer', 'move money', 'between accounts', 'top up', 'withdraw', 'savings'],
    steps: [
      {
        image: 'transfers-1',
        title: 'Open Full entry',
        body: 'A transfer needs two accounts, so start from the full editor rather than the quick keypad.',
      },
      {
        image: 'transfers-2',
        title: 'Switch to Transfer',
        body: 'The third tab at the top. Categories disappear, because a transfer is not spending.',
      },
      {
        image: 'transfers-3',
        title: 'Pick where it goes',
        body: 'From is already your default account. Tap To and choose the other side.',
      },
      {
        image: 'transfers-4',
        title: 'Enter the amount and save',
        body: 'One balance goes down, the other goes up. Your month totals do not move.',
      },
      {
        image: 'transfers-5',
        title: 'It shows both sides',
        body: 'The entry reads "Daily Checking to Japan trip", so you can see where the money went months later.',
      },
    ],
  },
  {
    id: 'log-by-voice',
    category: 'logging',
    title: 'Log by talking',
    summary: 'Say "coffee four fifty" and let the app fill in the rest.',
    keywords: ['voice', 'speak', 'dictate', 'microphone', 'hands free', 'speech'],
    steps: [
      {
        image: 'log-by-voice-1',
        title: 'Choose Voice entry',
        body: 'From the plus menu. The first time, your phone will ask for the microphone and speech recognition.',
      },
      {
        image: 'log-by-voice-2',
        title: 'Say what you spent',
        body: 'Talk normally: "lunch twelve dollars". Tap anywhere to stop. Everything is recognised on your phone.',
      },
      {
        image: 'log-by-voice-3',
        title: 'Skip the preview if you trust it',
        body: 'By default you get a chance to check before saving. Turn on Skip confirmation in Settings, Quick Entry to save instantly.',
      },
    ],
  },
  {
    id: 'scan-a-receipt',
    category: 'logging',
    title: 'Scan a receipt',
    summary: 'Snap a photo and let the app read the amount, merchant, and date.',
    keywords: ['receipt', 'scan', 'camera', 'photo', 'ocr', 'bill', 'attach'],
    steps: [
      {
        image: 'scan-a-receipt-1',
        title: 'Choose Scan receipt',
        body: 'From the plus menu. The free plan includes 20 scans.',
      },
      {
        image: 'scan-a-receipt-2',
        title: 'Frame the receipt',
        body: 'Fit it inside the box and tap the shutter. The album button on the left picks a photo you already have.',
      },
      {
        image: 'scan-a-receipt-3',
        title: 'Review what it read',
        body: 'The amount, merchant, and date come back filled in. Change anything that looks wrong, then save.',
      },
      {
        image: 'scan-a-receipt-4',
        title: 'Or attach one by hand',
        body: 'In the full editor, the Receipt button adds a photo to an entry you are already writing. No scan needed.',
      },
      {
        image: 'scan-a-receipt-5',
        title: 'Find them all later',
        body: 'Settings, then Receipts, lists every photo you have attached, searchable by note and date.',
      },
    ],
  },
  {
    id: 'find-a-transaction',
    category: 'logging',
    title: 'Find and fix an entry',
    summary: 'Search, filter, then edit or delete.',
    keywords: ['search', 'filter', 'edit', 'delete', 'change', 'mistake', 'find'],
    steps: [
      {
        image: 'find-a-transaction-1',
        title: 'Tap the magnifier',
        body: 'Top of the calendar. Search looks across every month, not just the one you are on.',
      },
      {
        image: 'find-a-transaction-2',
        title: 'Type any part of it',
        body: 'A merchant, a note, a category. Results come in as you type, newest first.',
      },
      {
        image: 'find-a-transaction-3',
        title: 'Narrow it with filters',
        body: 'The sliders icon next to search hides accounts or categories you do not want in the list.',
      },
      {
        image: 'find-a-transaction-4',
        title: 'Edit or delete',
        body: 'Tap an entry to open it. Change anything and tap Update, or use the bin in the top right to remove it.',
      },
    ],
  },
  {
    id: 'automations',
    category: 'logging',
    title: 'Log a card tap automatically',
    summary: 'Set up an iPhone Shortcut so paying with Apple Pay records itself.',
    platform: 'ios',
    keywords: ['shortcuts', 'apple pay', 'automation', 'back tap', 'auto log', 'nfc', 'tap to pay'],
    steps: [
      {
        image: 'automations-1',
        title: 'Open Automation',
        body: 'Settings, then Automation. Three set-ups live here: card payments, screenshots, and a plain new entry.',
      },
      {
        image: 'automations-2',
        title: 'Tap Tutorial next to the one you want',
        body: 'Log Card Payment fires on Apple Pay. Log Screenshot reads a payment screen after a Back Tap. New Transaction just opens the entry screen.',
      },
      {
        image: 'automations-3',
        title: 'Follow the walkthrough',
        body: 'Each one is a numbered guide with a picture of every screen in Shortcuts, plus a video if you would rather watch. The free plan includes 100 auto-logs.',
      },
    ],
  },
];
