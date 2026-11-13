import type { ReactNode } from 'react';
import { Blob, Branch } from '../components/flora';
import { PrivacyPanel } from '../components/PrivacyPanel';
import { PHONE_STRINGS, screenshotLocale } from './locales';
import type { PhoneStrings } from './locales';

export interface SceneConfig {
  id: string;
  headline: string;
  highlight?: string;
  subheadline: string;
  screenshot: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle?: number;
  accentColor: string;
  textColor: string;
  badge?: string;
  /** Where the headline block sits. Phone bleeds off the opposite edge. */
  headlinePos?: 'top' | 'bottom';
  headlineSize?: number;
  phoneScale?: number;
  phoneX?: number;
  phoneRotate?: number;
  /** Which canvas edge the device bleeds off. */
  phoneAnchor?: 'top' | 'bottom';
  /** How many px of the device are hidden past the bleed edge. */
  phoneCrop?: number;
  decorations?: ReactNode;
  /** Scenes 01–04 form one continuous composition cut into four panels. */
  panorama?: { panel: number };
}


const INK = '#2F2521';

/** One warm brand family across the whole set — the reddish/orange of scene 01. */
const BRAND = {
  from: '#FBF2EA',
  to: '#F7E7D9',
  accent: '#D9564A',
  floraA: '#EFA48B',
  floraB: '#E77F6C',
};

/* Corner foliage for the standalone scenes (renders behind the phone).
   Each scene gets its own arrangement so the set doesn't repeat. */

function FloraInsights() {
  return (
    <>
      <Blob x={1000} y={80} size={360} color={BRAND.floraA} opacity={0.45} rotate={20} />
      <Blob x={1090} y={360} size={220} color={BRAND.floraB} opacity={0.35} rotate={-24} />
      <Blob x={-140} y={330} size={320} color={BRAND.floraA} opacity={0.35} rotate={40} />
    </>
  );
}

function FloraRecurrings() {
  return (
    <>
      <Branch x={-60} y={110} size={310} color={BRAND.floraA} opacity={0.5} rotate={200} flip />
      <Blob x={1040} y={190} size={300} color={BRAND.floraB} opacity={0.35} rotate={-15} />
    </>
  );
}

function FloraHourly() {
  return (
    <>
      <Branch x={1000} y={120} size={290} color={BRAND.floraA} opacity={0.5} rotate={166} />
      <Branch x={-80} y={170} size={240} color={BRAND.floraB} opacity={0.4} rotate={205} flip />
    </>
  );
}

/** Left-heavy, mirroring the right-heavy FloraInsights. */
function FloraEntry() {
  return (
    <>
      <Blob x={-180} y={60} size={340} color={BRAND.floraA} opacity={0.45} rotate={18} />
      <Blob x={-60} y={340} size={210} color={BRAND.floraB} opacity={0.35} rotate={-22} />
      <Blob x={1060} y={150} size={300} color={BRAND.floraA} opacity={0.35} rotate={35} />
    </>
  );
}

function FloraSplit() {
  return (
    <>
      <Blob x={-170} y={90} size={330} color={BRAND.floraB} opacity={0.4} rotate={-30} />
      <Branch x={1010} y={60} size={270} color={BRAND.floraA} opacity={0.48} rotate={186} />
    </>
  );
}

export function getScenes(locale: string): SceneConfig[] {
  const t: PhoneStrings = PHONE_STRINGS[locale] ?? PHONE_STRINGS.en;
  const basePath = `/assets/screenshots-iphone/${screenshotLocale(locale)}`;

  const base = {
    gradientFrom: BRAND.from,
    gradientTo: BRAND.to,
    accentColor: BRAND.accent,
    textColor: INK,
  };

  return [
    /* ─────────── PANORAMA 1/4 ─ HOME (the hero: time beside every row) ───────────
       The ledger screen leads the gallery — it is the one place the whole
       premise is visible at a glance, with a work-time badge on every row. */
    {
      id: '01-home',
      headline: t.s1.h,
      highlight: t.s1.hl,
      subheadline: '',
      screenshot: `${basePath}/01-home.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      panorama: { panel: 0 },
    },

    /* ─────────── PANORAMA 2/4 ─ PRIVACY (no phone) ───────────
       The trust panel: rating, three promises, the book behind the app. */
    {
      id: '02-privacy',
      headline: t.s15.h,
      highlight: t.s15.hl,
      subheadline: '',
      screenshot: '',
      ...base,
      panorama: { panel: 1 },
      decorations: <PrivacyPanel t={t.s15} />,
    },

    /* ─────────── PANORAMA 3/4 ─ ACCOUNTS / NET ASSETS ─────────── */
    {
      id: '03-accounts',
      headline: t.s2.h,
      highlight: t.s2.hl,
      subheadline: '',
      screenshot: `${basePath}/02-accounts.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      panorama: { panel: 2 },
    },

    /* ─────────── PANORAMA 4/4 ─ BUDGETING ─────────── */
    {
      id: '04-budgeting',
      headline: t.s16.h,
      highlight: t.s16.hl,
      subheadline: '',
      screenshot: `${basePath}/08-budgeting.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      panorama: { panel: 3 },
    },

    /* ───────────────────── 05 ─ EXPENSE BREAKDOWN ───────────────────── */
    {
      id: '05-insights',
      headline: t.s4.h,
      highlight: t.s4.hl,
      subheadline: '',
      screenshot: `${basePath}/03-expense-breakdown.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      decorations: <FloraInsights />,
    },

    /* ───────────────────── 06 ─ CREATE TRANSACTION ─────────────────────
       Bleeds off the bottom like every other scene. The amount and its
       work-time line sit mid-screen, so they survive the standard crop; only
       the Add buttons fall past the edge. */
    {
      id: '06-add-expense',
      headline: t.s14.h,
      highlight: t.s14.hl,
      subheadline: '',
      screenshot: `${basePath}/07-create-transaction.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      decorations: <FloraEntry />,
    },

    /* ───────────────────── 07 ─ RECURRING ───────────────────── */
    {
      id: '07-recurrings',
      headline: t.s10.h,
      highlight: t.s10.hl,
      subheadline: '',
      screenshot: `${basePath}/04-subscription-recurring.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      decorations: <FloraRecurrings />,
    },

    /* ───────────────────── 08 ─ HOURLY VALUE ───────────────────── */
    {
      id: '08-hourly-rates',
      headline: t.s9.h,
      highlight: t.s9.hl,
      subheadline: '',
      screenshot: `${basePath}/06-hourly-wage.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      decorations: <FloraHourly />,
    },

    /* ───────────────────── 09 ─ SPLIT BILL ───────────────────── */
    {
      id: '09-split-bill',
      headline: t.s8.h,
      highlight: t.s8.hl,
      subheadline: '',
      screenshot: `${basePath}/05-split-bill.png`,
      ...base,
      phoneScale: 3.6, phoneCrop: 430, phoneRotate: 0,
      decorations: <FloraSplit />,
    },

  ];
}
