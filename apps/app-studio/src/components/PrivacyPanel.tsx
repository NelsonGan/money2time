/**
 * Scene 02: the privacy and trust panel, the one iPhone scene without a phone.
 * It sits in the opening panorama between Home and Accounts and draws its own
 * header, so the scene has no headline and only the background comes from
 * ScreenshotScene.
 *
 * Top to bottom: the headline beside the chick mascot hugging a shield, the
 * laurel rating in a card, one card per promise (Local first, No ads, Private
 * by design) and the book behind the app. The mascot badge and the three
 * promise icons are generated art in `public/assets/privacy/`: the badge is
 * `mascots/premium-lifetime.png` with its card edited into a shield, and the
 * icons are painted in a crayon take on the mascot; everything else is drawn
 * here.
 */

import { DISPLAY_FONT, renderHeadline } from './sceneParts';
import { useFitText } from './useFitText';
import type { PhoneStrings } from '../scenes/locales';

const INK = '#2F2521';
const MUTED = '#84685C';
const ACCENT = '#D9564A';
const LAUREL = '#F0A431';
const CARD = {
  width: 1140, boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.6)',
  borderRadius: 56,
  boxShadow: '0 26px 64px rgba(160,84,58,0.12)',
} as const;

/** Per-promise tinted circle and the colour of its supporting line. */
const PROMISES = {
  local:   { icon: '/assets/privacy/local.png',   tint: '#E7EDDC', accent: '#71945B' },
  noAds:   { icon: '/assets/privacy/noads.png',   tint: '#F7E8CD', accent: '#C9861F' },
  privacy: { icon: '/assets/privacy/private.png', tint: '#FADFD6', accent: '#D9564A' },
};

const STAR_PATH = 'M12 2 L14.9 8.6 L22 9.2 L16.6 13.9 L18.2 21 L12 17.3 L5.8 21 L7.4 13.9 L2 9.2 L9.1 8.6 Z';

/** A star filled left to right by `fill` (0–1), so 4.8 shows as 4 and most of a fifth. */
function Star({ size, fill }: { size: number; fill: number }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ position: 'absolute' }}>
        <path d={STAR_PATH} fill="#E9D3BE" />
      </svg>
      <div style={{ position: 'absolute', width: size * fill, height: size, overflow: 'hidden' }}>
        <svg width={size} height={size} viewBox="0 0 24 24">
          <path d={STAR_PATH} fill={LAUREL} />
        </svg>
      </div>
    </div>
  );
}

/**
 * One laurel wing (left side); mirror with `flip` for the right. Pairs of
 * leaves splay from a C-shaped arc, larger at the base and tapering to the tip.
 */
function LaurelWing({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width={100} height={230} viewBox="0 0 100 220" fill={LAUREL}
      style={{ transform: flip ? 'scaleX(-1)' : undefined }}
    >
      <ellipse cx="72" cy="188" rx="19" ry="8.5" transform="rotate(-105 72 188)" />
      <ellipse cx="63" cy="204" rx="19" ry="8.5" transform="rotate(-15 63 204)" />
      <ellipse cx="51" cy="163" rx="18" ry="8" transform="rotate(-80 51 163)" />
      <ellipse cx="37" cy="173" rx="18" ry="8" transform="rotate(10 37 173)" />
      <ellipse cx="39" cy="132" rx="17" ry="7.5" transform="rotate(-55 39 132)" />
      <ellipse cx="21" cy="136" rx="17" ry="7.5" transform="rotate(35 21 136)" />
      <ellipse cx="35" cy="99" rx="16" ry="7" transform="rotate(-40 35 99)" />
      <ellipse cx="17" cy="97" rx="16" ry="7" transform="rotate(50 17 97)" />
      <ellipse cx="40" cy="68" rx="15" ry="6.5" transform="rotate(-20 40 68)" />
      <ellipse cx="24" cy="60" rx="15" ry="6.5" transform="rotate(70 24 60)" />
      <ellipse cx="52" cy="42" rx="14" ry="6" transform="rotate(0 52 42)" />
      <ellipse cx="40" cy="30" rx="14" ry="6" transform="rotate(-90 40 30)" />
      <ellipse cx="68" cy="24" rx="13" ry="5.5" transform="rotate(20 68 24)" />
      <ellipse cx="60" cy="8" rx="13" ry="5.5" transform="rotate(-70 60 8)" />
      <ellipse cx="80" cy="10" rx="11" ry="5" transform="rotate(-10 80 10)" />
    </svg>
  );
}

/** App Store style laurel rating: 4.8 over stars, flanked by wings. */
function LaurelRating({ users }: { users: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30 }}>
      <LaurelWing />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{
          fontSize: 108, fontWeight: 800, color: INK,
          letterSpacing: '-3px', lineHeight: 1, fontFamily: DISPLAY_FONT,
        }}>4.8</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {[1, 1, 1, 1, 0.8].map((fill, i) => <Star key={i} size={42} fill={fill} />)}
        </div>
        <div style={{
          fontSize: 27, fontWeight: 700, color: MUTED,
          letterSpacing: '3px', textTransform: 'uppercase', marginTop: 20,
        }}>{users}</div>
      </div>
      <LaurelWing flip />
    </div>
  );
}

function PromiseCard({ promise, title, sub }: {
  promise: (typeof PROMISES)[keyof typeof PROMISES]; title: string; sub: string;
}) {
  const titleRef = useFitText<HTMLDivElement>(64, 0.6);
  return (
    <div style={{
      ...CARD, padding: '42px 54px',
      display: 'flex', alignItems: 'center', gap: 52, textAlign: 'left',
    }}>
      <div style={{
        width: 186, height: 186, borderRadius: '50%', flexShrink: 0,
        background: promise.tint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img src={promise.icon} alt="" style={{ width: 152, height: 152 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div ref={titleRef} style={{
          fontSize: 64, fontWeight: 800, color: INK, whiteSpace: 'nowrap',
          letterSpacing: '-2px', lineHeight: 1.05, fontFamily: DISPLAY_FONT,
        }}>{title}</div>
        <div style={{
          fontSize: 41, fontWeight: 600, color: promise.accent,
          marginTop: 16, lineHeight: 1.3,
        }}>{sub}</div>
      </div>
    </div>
  );
}

export function PrivacyPanel({ t }: { t: PhoneStrings['s15'] }) {
  const headlineRef = useFitText<HTMLHeadingElement>(122, 0.55);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10,
      boxSizing: 'border-box', padding: '96px 72px 110px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* Header: headline left, mascot badge right. Fixed height so the rating,
          cards and book sit at the same y in every locale. */}
      <div style={{
        width: 1140, height: 500, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', gap: 30,
      }}>
        <h1 ref={headlineRef} style={{
          flex: 1, minWidth: 0,
          fontSize: 122, fontWeight: 800, color: INK,
          lineHeight: 1.1, margin: 0, textAlign: 'left',
          whiteSpace: 'pre-line', letterSpacing: '-3px',
          fontFamily: DISPLAY_FONT,
        }}>{renderHeadline(t.h, t.hl, ACCENT)}</h1>
        <img
          src="/assets/privacy/hero.png" alt=""
          style={{ height: 390, width: 'auto', flexShrink: 0, display: 'block' }}
        />
      </div>

      <div style={{ ...CARD, padding: '46px 40px', marginTop: 40 }}>
        <LaurelRating users={t.users} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 32, marginTop: 40 }}>
        <PromiseCard promise={PROMISES.local} title={t.local} sub={t.localSub} />
        <PromiseCard promise={PROMISES.noAds} title={t.noAds} sub={t.noAdsSub} />
        <PromiseCard promise={PROMISES.privacy} title={t.privacy} sub={t.privacySub} />
      </div>

      {/* The book that inspired the app, pinned to the remaining space */}
      <div style={{
        marginTop: 'auto', paddingTop: 44, width: 1140,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 44,
        }}>
          <div style={{ width: 470, flexShrink: 0, textAlign: 'left' }}>
            <div style={{
              display: 'inline-block',
              padding: '16px 38px', borderRadius: 100,
              background: 'rgba(217,86,74,0.12)',
              fontSize: 25, fontWeight: 800, color: ACCENT,
              letterSpacing: '2.5px', textTransform: 'uppercase',
            }}>{t.inspiredPre}</div>
            <div style={{
              fontSize: 42, fontWeight: 500, color: INK,
              lineHeight: 1.4, marginTop: 30,
            }}>{t.bookDesc}</div>
          </div>
          <img
            src="/assets/icons/ymoyl-cover.jpg"
            alt="Your Money or Your Life"
            crossOrigin="anonymous"
            style={{
              width: 340, height: 'auto', display: 'block', flexShrink: 0,
              borderRadius: 14, transform: 'rotate(2deg)',
              boxShadow: '0 46px 100px rgba(80,40,30,0.30), 0 14px 32px rgba(80,40,30,0.15)',
            }}
          />
        </div>
        <div style={{
          fontSize: 36, fontWeight: 500, color: MUTED,
          lineHeight: 1.4, fontStyle: 'italic', marginTop: 44,
          textAlign: 'center', maxWidth: 1100,
        }}>“{t.bookSub}”</div>
      </div>
    </div>
  );
}
