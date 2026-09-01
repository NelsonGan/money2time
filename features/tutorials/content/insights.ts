import type { Tutorial } from './types';

export const INSIGHTS_TUTORIALS: Tutorial[] = [
  {
    id: 'calendar',
    category: 'insights',
    title: 'Read your calendar',
    summary: 'Three zoom levels: a year, a month, a day.',
    keywords: ['calendar', 'month', 'year', 'day', 'grid', 'zoom', 'home screen'],
    steps: [
      {
        image: 'calendar-4',
        title: 'Zoom out to the year',
        body: 'Tap the year in the top left. Days you spent on are marked, so a heavy stretch is visible at a glance.',
      },
      {
        image: 'calendar-1',
        title: 'A month of daily totals',
        body: 'Each cell shows what came in and what went out that day. Tap the month title in the top left to zoom out.',
      },
      {
        image: 'calendar-2',
        title: 'Tap a day to open it',
        body: 'The grid folds away and the list jumps to that day. Tap the month title again to bring the grid back.',
      },
      {
        image: 'calendar-3',
        title: 'Income and expense for the month',
        body: 'The two cards at the top total the month you are on. Tap either to filter the list below.',
      },
    ],
  },
  {
    id: 'insights',
    category: 'insights',
    title: 'Read your spending charts',
    summary: 'Find where the money actually went, then drill into it.',
    keywords: ['insights', 'chart', 'breakdown', 'pie', 'analytics', 'report', 'trend', 'category'],
    steps: [
      {
        image: 'insights-1',
        title: 'Open the Insights tab',
        body: 'Expense Breakdown is the default: one slice per category for the month you are on.',
      },
      {
        image: 'insights-2',
        title: 'Switch the chart',
        body: 'The icon in the top left lists everything on offer, from income breakdown and savings rate to trends and sentiment.',
      },
      {
        image: 'insights-3',
        title: 'Tap a slice',
        body: 'Every category under the chart is tappable, with its share of the month next to it.',
      },
      {
        image: 'insights-4',
        title: 'Drill into the detail',
        body: 'You get the subcategories inside it and how many transactions each one holds. Tap again to reach the entries themselves.',
      },
    ],
  },
  {
    id: 'review',
    category: 'insights',
    title: 'Check your pace for the month',
    summary: 'Are you spending faster than usual? Review Spending answers that.',
    keywords: [
      'review',
      'pace',
      'summary',
      'weekly',
      'monthly',
      'saved',
      'savings rate',
      'compare',
    ],
    steps: [
      {
        image: 'review-1',
        title: 'Open Review Spending',
        body: 'On the Insights tab, tap the icon in the top left and pick the first entry.',
      },
      {
        image: 'review-2',
        title: 'Pick a window',
        body: 'The strip of dates under the header moves you between periods. Tap the filter button in the top right to switch between week, month, and year, or to leave an account or category out of the report.',
      },
      {
        image: 'review-3',
        title: 'Read in and out',
        body: 'What came in, what went out, and what you kept. The percentage next to Spent compares it with your usual.',
      },
      {
        image: 'review-4',
        title: 'Check the pace bar',
        body: 'Green means you are under your usual for this point in the month. The categories below show which ones are driving it.',
      },
    ],
  },
  {
    id: 'widgets',
    category: 'insights',
    title: 'Add a home screen widget',
    summary: 'Log an expense without opening the app.',
    platform: 'ios',
    keywords: ['widget', 'home screen', 'lock screen', 'shortcut', 'ios', 'monthly spend'],
    steps: [
      {
        image: 'widgets-1',
        title: 'Enter edit mode',
        body: 'Press and hold an empty part of your home screen, then tap Edit in the top left and choose Add Widget.',
      },
      {
        image: 'widgets-2',
        title: 'Find Money2Time',
        body: 'Search for it, then swipe through the sizes. There are widgets for monthly spend, budgets, goals, and more.',
      },
      {
        image: 'widgets-3',
        title: 'Log straight from it',
        body: 'The Income and Expense buttons open the entry screen. The rest of the widget updates as you log.',
      },
    ],
  },
];
