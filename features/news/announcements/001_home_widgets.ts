import type { FeatureAnnouncement } from '../featureAnnouncements';

export const homeWidgetsAnnouncement: FeatureAnnouncement = {
  id: 'home_widgets_2026_06',
  announcementNumber: 1,
  title: 'Home Screen Widgets',
  summary: 'See your spending, week, and month right on your home screen.',
  releaseDate: '2026-06-04',
  pages: [
    {
      eyebrow: 'New',
      title: 'Money2Time on your home screen',
      body: 'See what you have spent this month, and what it costs in hours of work, without opening the app.',
      accent: 'primary',
      visual: 'monthly',
    },
    {
      eyebrow: 'Pro',
      title: 'Your week at a glance',
      body: 'A bar for each of the last seven days, so a heavy spending day stands out instantly.',
      accent: 'error',
      visual: 'weekly',
    },
    {
      eyebrow: 'Pro',
      title: 'Your whole month, mapped',
      body: 'Income and expenses on every day of the month, just like the in-app calendar.',
      accent: 'lavender',
      visual: 'calendar',
    },
  ],
};
