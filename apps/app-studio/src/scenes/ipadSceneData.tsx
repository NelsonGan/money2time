import { PHONE_STRINGS, screenshotLocale } from './locales';
import type { PhoneStrings } from './locales';

/**
 * iPad scenes, landscape 2732 × 2048.
 *
 * The app has no tablet layout worth showing, so each scene pairs a headline
 * with two phone screens from the locale's own iPhone set, the way the ricecal
 * creator does. Everything on the left reuses copy that is already translated
 * for the phone scenes: the headline and supporting line of one scene, and the
 * emoji and supporting line of three others as proof points.
 */
export interface IPadSceneConfig {
  id: string;
  headline: string;
  highlight?: string;
  subheadline: string;
  /** Three short lines beside the headline. */
  bullets: Array<{ icon: string; text: string }>;
  /** Back screen first, front screen second. */
  shots: [string, string];
  gradientFrom: string;
  gradientTo: string;
  accentColor: string;
  textColor: string;
  subColor: string;
}

const INK = '#2F2521';

/** The phone set's warm brand family, with one accent per scene. */
const BASE = {
  gradientFrom: '#FBF2EA',
  textColor: INK,
  subColor: '#6E5A52',
};

export function getIPadScenes(locale: string): IPadSceneConfig[] {
  const t: PhoneStrings = PHONE_STRINGS[locale] ?? PHONE_STRINGS.en;
  const t15 = t.s15 ?? PHONE_STRINGS.en.s15!;
  const p = `/assets/screenshots-iphone/${screenshotLocale(locale)}`;
  const proof = (s: { she: string; sh: string }) => ({ icon: s.she, text: s.sh });

  return [
    {
      id: '01-every-row',
      headline: t.s1.h,
      highlight: t.s1.hl,
      subheadline: t.s1.sh,
      bullets: [proof(t.s5), proof(t.s9), proof(t.s14)],
      shots: [`${p}/06-hourly-wage.png`, `${p}/01-home.png`],
      ...BASE,
      accentColor: '#D9564A',
      gradientTo: '#F7DDD0',
    },
    {
      id: '02-all-your-money',
      headline: t.s2.h,
      highlight: t.s2.hl,
      subheadline: t.s2.sh,
      bullets: [proof(t.s16), proof(t.s6), proof(t.s3)],
      shots: [`${p}/08-budgeting.png`, `${p}/02-accounts.png`],
      ...BASE,
      accentColor: '#1F8A6F',
      gradientTo: '#E2EEDF',
    },
    {
      id: '03-track-in-seconds',
      headline: t.s7.h,
      highlight: t.s7.hl,
      subheadline: t.s7.sh,
      bullets: [proof(t.s8), proof(t.s13), proof(t.s12)],
      shots: [`${p}/05-split-bill.png`, `${p}/07-create-transaction.png`],
      ...BASE,
      accentColor: '#C9861F',
      gradientTo: '#F7E8CD',
    },
    {
      id: '04-where-it-goes',
      headline: t.s4.h,
      highlight: t.s4.hl,
      subheadline: t.s4.sh,
      bullets: [
        proof(t.s10),
        { icon: '🔒', text: t15.privacySub },
        { icon: '✈️', text: t15.localSub },
      ],
      shots: [`${p}/04-subscription-recurring.png`, `${p}/03-expense-breakdown.png`],
      ...BASE,
      accentColor: '#B1525F',
      gradientTo: '#F3DDE2',
    },
  ];
}
