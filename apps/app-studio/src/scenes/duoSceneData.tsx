import { PHONE_STRINGS, screenshotLocale } from './locales';
import type { PhoneStrings } from './locales';

/**
 * iPhone Duo scenes, landscape 2853 × 2007.
 *
 * Open, the Duo's inner display is landscape, and the app lays out for it: tabs
 * in a side rail, Home as month grid and ledger side by side. Each scene shows
 * one of those screens, captured on the Duo simulator from the locale's own
 * preview profile (`/assets/screenshots-duo/<locale>/`), the way the iPhone set
 * is. Headlines reuse the iPhone scenes' copy and order, so the two galleries
 * tell the same story in every language without a new string to translate.
 */
export interface DuoSceneConfig {
  id: string;
  headline: string;
  highlight?: string;
  screenshot: string;
  accentColor: string;
  gradientTo: string;
}

export function getDuoScenes(locale: string): DuoSceneConfig[] {
  const t: PhoneStrings = PHONE_STRINGS[locale] ?? PHONE_STRINGS.en;
  const p = `/assets/screenshots-duo/${screenshotLocale(locale)}`;

  return [
    { id: '01-home', headline: t.s1.h, highlight: t.s1.hl, screenshot: `${p}/01-home.png`,
      accentColor: '#D9564A', gradientTo: '#F7DDD0' },
    { id: '02-accounts', headline: t.s2.h, highlight: t.s2.hl, screenshot: `${p}/02-accounts.png`,
      accentColor: '#1F8A6F', gradientTo: '#E2EEDF' },
    { id: '03-budgeting', headline: t.s16.h, highlight: t.s16.hl, screenshot: `${p}/08-budgeting.png`,
      accentColor: '#C9861F', gradientTo: '#F7E8CD' },
    { id: '04-insights', headline: t.s4.h, highlight: t.s4.hl, screenshot: `${p}/03-expense-breakdown.png`,
      accentColor: '#B1525F', gradientTo: '#F3DDE2' },
    { id: '05-add-expense', headline: t.s14.h, highlight: t.s14.hl, screenshot: `${p}/07-create-transaction.png`,
      accentColor: '#D9564A', gradientTo: '#F7DDD0' },
    { id: '06-recurrings', headline: t.s10.h, highlight: t.s10.hl, screenshot: `${p}/04-subscription-recurring.png`,
      accentColor: '#1F8A6F', gradientTo: '#E2EEDF' },
    { id: '07-hourly-rates', headline: t.s9.h, highlight: t.s9.hl, screenshot: `${p}/06-hourly-wage.png`,
      accentColor: '#C9861F', gradientTo: '#F7E8CD' },
    { id: '08-split-bill', headline: t.s8.h, highlight: t.s8.hl, screenshot: `${p}/05-split-bill.png`,
      accentColor: '#B1525F', gradientTo: '#F3DDE2' },
  ];
}
