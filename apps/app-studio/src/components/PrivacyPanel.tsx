/**
 * Scene 02: the privacy and trust panel, the one iPhone scene without a phone.
 * It sits in the opening panorama between Home and Accounts, so this draws
 * only the content; the headline and background come from ScreenshotScene
 * like every other panorama scene.
 *
 * Three blocks, each readable at App Store thumbnail size: the rating in a
 * pill, the three promises in one card, and the book behind the app in a
 * second card with its cover breaking out of the top edge. Everything but the
 * book cover is drawn here, so it stays sharp at export size.
 */

import type { ReactNode } from 'react';
import { DISPLAY_FONT } from './sceneParts';
import { useFitText } from './useFitText';
import type { PhoneStrings } from '../scenes/locales';

const INK = '#2F2521';
const MUTED = '#5F4D45';
const ACCENT = '#D9564A';
const GOLD = '#E3A93B';
const LAUREL = '#DDA236';
const CARD = {
  background: 'rgba(255,255,255,0.78)',
  borderRadius: 72,
  boxShadow: '0 30px 70px rgba(160,84,58,0.12), 0 4px 14px rgba(160,84,58,0.06)',
} as const;

/** One laurel wing (left side); mirror with `flip` for the right. */
function LaurelWing({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width={136} height={300} viewBox="0 0 100 220" fill={LAUREL}
      style={{ flexShrink: 0, transform: flip ? 'scaleX(-1)' : undefined }}
    >
      <path d="M70 216 C 34 186, 14 140, 22 92 C 28 56, 50 24, 80 8" fill="none" stroke={LAUREL} strokeWidth={4} strokeLinecap="round" />
      <ellipse cx="72" cy="188" rx="19" ry="11.9" transform="rotate(-105 72 188)" />
      <ellipse cx="63" cy="204" rx="19" ry="11.9" transform="rotate(-15 63 204)" />
      <ellipse cx="51" cy="163" rx="18" ry="11.2" transform="rotate(-80 51 163)" />
      <ellipse cx="37" cy="173" rx="18" ry="11.2" transform="rotate(10 37 173)" />
      <ellipse cx="39" cy="132" rx="17" ry="10.5" transform="rotate(-55 39 132)" />
      <ellipse cx="21" cy="136" rx="17" ry="10.5" transform="rotate(35 21 136)" />
      <ellipse cx="35" cy="99" rx="16" ry="9.8" transform="rotate(-40 35 99)" />
      <ellipse cx="17" cy="97" rx="16" ry="9.8" transform="rotate(50 17 97)" />
      <ellipse cx="40" cy="68" rx="15" ry="9.1" transform="rotate(-20 40 68)" />
      <ellipse cx="24" cy="60" rx="15" ry="9.1" transform="rotate(70 24 60)" />
      <ellipse cx="52" cy="42" rx="14" ry="8.4" transform="rotate(0 52 42)" />
      <ellipse cx="40" cy="30" rx="14" ry="8.4" transform="rotate(-90 40 30)" />
      <ellipse cx="68" cy="24" rx="13" ry="7.7" transform="rotate(20 68 24)" />
      <ellipse cx="60" cy="8" rx="13" ry="7.7" transform="rotate(-70 60 8)" />
      <ellipse cx="80" cy="10" rx="11" ry="7.0" transform="rotate(-10 80 10)" />
    </svg>
  );
}

function Star() {
  return (
    <svg width={74} height={74} viewBox="0 0 24 24">
      <path
        d="M12 2.6l2.83 5.9 6.47.8-4.76 4.46 1.2 6.42L12 17.06l-5.74 3.12 1.2-6.42L2.7 9.3l6.47-.8z"
        fill={GOLD}
      />
    </svg>
  );
}

function Rating({ users }: { users: string }) {
  const usersRef = useFitText<HTMLDivElement>(48, 0.6);
  return (
    <div style={{
      position: 'absolute', top: 490, left: '50%', transform: 'translateX(-50%)',
      width: 940, height: 370, boxSizing: 'border-box', padding: '0 52px',
      ...CARD, borderRadius: 180,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      zIndex: 6,
    }}>
      <LaurelWing />
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <div style={{
          fontFamily: DISPLAY_FONT, fontSize: 160, fontWeight: 800, color: INK,
          lineHeight: 1, letterSpacing: '-4px',
        }}>4.8</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, margin: '10px 0 10px' }}>
          {[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}
        </div>
        <div ref={usersRef} style={{
          fontFamily: DISPLAY_FONT, fontSize: 48, fontWeight: 700, color: INK,
          whiteSpace: 'nowrap',
        }}>{users}</div>
      </div>
      <LaurelWing flip />
    </div>
  );
}

/* Flat icons on tinted circles, one hue per promise: coral, mustard, sage. */

const ShieldIcon = (
  <svg width={140} height={140} viewBox="5 2.5 38 43">
    <path d="M24 4 L40 10 V22 C40 33 33 40 24 44 C15 40 8 33 8 22 V10 Z" fill="#E0644F" />
    <path d="M19 23 v-3.5 a5 5 0 0 1 10 0 V23" fill="none" stroke="#FFF6EC" strokeWidth={3} strokeLinecap="round" />
    <rect x="16.5" y="22" width="15" height="12" rx="3" fill="#FFF6EC" />
    <circle cx="24" cy="27" r="1.9" fill="#E0644F" />
    <rect x="23.1" y="27.5" width="1.8" height="3.6" rx="0.9" fill="#E0644F" />
  </svg>
);

const NoAdsIcon = (
  <svg width={140} height={140} viewBox="4.5 5 38 38">
    <path d="M9 19 h6 l15 -8 v26 l-15 -8 h-6 a2 2 0 0 1 -2 -2 v-6 a2 2 0 0 1 2 -2 Z" fill="#DE9E2C" />
    <path d="M13 29 l3 8 a2 2 0 0 0 2.6 1.1 l1.2 -0.5 a2 2 0 0 0 1.1 -2.6 L19 30" fill="#C98A22" />
    <path d="M35 17 q4 7 0 14" fill="none" stroke="#DE9E2C" strokeWidth={3.4} strokeLinecap="round" />
    <path d="M8 40 L40 8" stroke="#F9EBD0" strokeWidth={6.5} strokeLinecap="round" />
    <path d="M8 40 L40 8" stroke="#D9564A" strokeWidth={4.4} strokeLinecap="round" />
  </svg>
);

const LocalIcon = (
  <svg width={140} height={140} viewBox="5 2.5 38 43">
    <rect x="13" y="4" width="22" height="40" rx="5" fill="#7FA86D" />
    <rect x="16" y="9" width="16" height="28" rx="2" fill="#FFF6EC" />
    <rect x="21" y="40" width="6" height="1.8" rx="0.9" fill="#FFF6EC" />
    <path d="M18.5 23.5 L24 18.5 L29.5 23.5 V31 a1 1 0 0 1 -1 1 H19.5 a1 1 0 0 1 -1 -1 Z" fill="#5B8BA8" />
    <rect x="22.3" y="26.5" width="3.4" height="5.5" rx="0.8" fill="#FFF6EC" />
  </svg>
);

function PromiseRow({ icon, tint, title, sub, divider }: {
  icon: ReactNode; tint: string; title: string; sub: string; divider: boolean;
}) {
  const titleRef = useFitText<HTMLDivElement>(80, 0.55);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 48, height: 316,
      borderBottom: divider ? '3px solid rgba(160,84,58,0.10)' : 'none',
    }}>
      <div style={{
        width: 216, height: 216, borderRadius: '50%', background: tint, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div ref={titleRef} style={{
          fontFamily: DISPLAY_FONT, fontSize: 80, fontWeight: 800, color: INK,
          lineHeight: 1.05, letterSpacing: '-1.5px', whiteSpace: 'nowrap',
        }}>{title}</div>
        <div style={{
          fontSize: 50, fontWeight: 500, color: MUTED, lineHeight: 1.28, marginTop: 14,
          textWrap: 'balance',
        }}>{sub}</div>
      </div>
    </div>
  );
}

function Book({ t }: { t: PhoneStrings['s15'] }) {
  return (
    <div style={{
      position: 'absolute', top: 2080, left: 72, right: 72, height: 430,
      boxSizing: 'border-box', padding: '0 400px 0 64px',
      ...CARD,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      textAlign: 'left', zIndex: 6,
    }}>
      <div style={{
        fontFamily: DISPLAY_FONT, fontSize: 48, fontWeight: 800, color: ACCENT,
        letterSpacing: '4px', textTransform: 'uppercase',
      }}>{t.inspiredPre}</div>
      <div style={{
        fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'italic',
        fontSize: 52, color: INK, lineHeight: 1.3, marginTop: 24,
        textWrap: 'balance',
      }}>“{t.bookSub}”</div>
      <img src="/assets/icons/ymoyl-cover.jpg" alt="" style={{
        position: 'absolute', right: 60, top: -96, width: 330,
        borderRadius: 12, transform: 'rotate(5deg)',
        boxShadow: '0 30px 60px rgba(120,60,40,0.28), 0 8px 18px rgba(120,60,40,0.16)',
      }} />
    </div>
  );
}

export function PrivacyPanel({ t }: { t: PhoneStrings['s15'] }) {
  return (
    <>
      <Rating users={t.users} />
      <div style={{
        position: 'absolute', top: 905, left: 72, right: 72,
        boxSizing: 'border-box', padding: '22px 60px',
        ...CARD, zIndex: 6,
      }}>
        <PromiseRow icon={ShieldIcon} tint="#FBE1D9" title={t.privacy} sub={t.privacySub} divider />
        <PromiseRow icon={NoAdsIcon} tint="#F9EBD0" title={t.noAds} sub={t.noAdsSub} divider />
        <PromiseRow icon={LocalIcon} tint="#E5EEDD" title={t.local} sub={t.localSub} divider={false} />
      </div>
      <Book t={t} />
    </>
  );
}
