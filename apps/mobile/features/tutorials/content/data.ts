import type { Tutorial } from './types';

export const DATA_TUTORIALS: Tutorial[] = [
  {
    id: 'backup',
    category: 'data',
    title: 'Back up and restore',
    summary: 'Your data lives on your phone. This is how it survives a new one.',
    keywords: [
      'backup',
      'restore',
      'icloud',
      'google drive',
      'export',
      'new phone',
      'excel',
      'json',
    ],
    steps: [
      {
        image: 'backup-1',
        title: 'Open Data Management',
        body: 'Settings, then Data Management. Everything about getting data in and out is here.',
      },
      {
        image: 'backup-2',
        title: 'Turn on automatic backups',
        body: 'Once a day, in the background, to iCloud or Google Drive. No account or login needed.',
      },
      {
        image: 'backup-3',
        title: 'Restore from the list',
        body: 'Every backup is kept with its date and size. Tap one to bring everything back.',
      },
      {
        image: 'backup-4',
        title: 'Keep your own copy',
        body: 'Export Database writes a JSON file you can save anywhere. That is the file Import Money2Time Backup reads.',
      },
      {
        image: 'backup-5',
        title: 'Or export to a spreadsheet',
        body: 'Export to Excel gives you transactions, accounts, categories, and recurring rules as sheets you can open in Excel, Numbers, or Google Sheets.',
      },
    ],
  },
  {
    id: 'import-data',
    category: 'data',
    title: 'Bring in your existing data',
    summary: 'From a bank statement, another app, or a Money2Time backup.',
    keywords: ['import', 'statement', 'bank', 'money manager', 'mmbak', 'csv', 'pdf', 'migrate'],
    steps: [
      {
        image: 'import-data-1',
        title: 'Open Statement Import',
        body: 'Settings, then Statement Import. This turns a bank statement into transactions.',
      },
      {
        image: 'import-data-2',
        title: 'Copy the prompt',
        body: 'Tap Copy Prompt, then open Claude, ChatGPT, or Gemini and attach your statement. Your statement never goes through us.',
      },
      {
        image: 'import-data-3',
        title: 'Paste the result back',
        body: 'Copy the JSON the assistant gives you and tap Paste from Clipboard. You get a preview and can untick anything you do not want.',
      },
      {
        image: 'import-data-4',
        title: 'Coming from another app?',
        body: 'Data Management imports a Money2Time backup or a Money Manager .mmbackup file, including accounts, categories, and recurring rules.',
      },
    ],
  },
  {
    id: 'app-lock',
    category: 'data',
    title: 'Lock the app with Face ID',
    summary: 'Ask for your face or fingerprint before the app opens.',
    pro: true,
    keywords: ['lock', 'face id', 'touch id', 'privacy', 'passcode', 'biometric', 'security'],
    steps: [
      {
        image: 'app-lock-1',
        title: 'Open App Lock',
        body: 'Settings, then App Lock, under DATA.',
      },
      {
        image: 'app-lock-2',
        title: 'Turn on Require unlock',
        body: 'From then on the app asks for Face ID, Touch ID, or your device passcode before it shows anything.',
      },
    ],
  },
];
