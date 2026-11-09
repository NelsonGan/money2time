import { forwardRef } from 'react';
import { BrandLockup } from './BrandLockup';
import { DeviceFrame } from './DeviceFrame';
import { LANDING_EXPORT_WIDTH, LANDING_EXPORT_HEIGHT } from '../utils/export';
import { LANDING_COPY, screenshotLocale } from '../scenes/locales';

interface LandingGraphicProps {
  locale: string;
  previewScale?: number;
}

const W = LANDING_EXPORT_WIDTH;
const H = LANDING_EXPORT_HEIGHT;

const COLORS = {
  rose: '#B1525F',
  green: '#1F8A6F',
  gold: '#F6B750',
  coral: '#F37D57',
  ink: '#1A2E2A',
};

const SCREENS = (locale: string) => {
  const l = screenshotLocale(locale);
  return {
    topLeft: `/assets/screenshots-iphone/${l}/02-accounts.png`,
    topRight: `/assets/screenshots-iphone/${l}/06-hourly-wage.png`,
    bottomLeft: `/assets/screenshots-iphone/${l}/03-expense-breakdown.png`,
    bottomCenter: `/assets/screenshots-iphone/${l}/01-home.png`,
    bottomRight: `/assets/screenshots-iphone/${l}/08-budgeting.png`,
  };
};

function renderTitle(title: string, highlight: string) {
  if (!title.includes(highlight)) return title;
  const idx = title.indexOf(highlight);
  return (
    <>
      {title.slice(0, idx)}
      <span style={{ color: COLORS.rose }}>{highlight}</span>
      {title.slice(idx + highlight.length)}
    </>
  );
}

function AppStoreBadge() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 12,
      background: '#000', color: '#fff',
      padding: '12px 22px', borderRadius: 14,
      height: 64, boxSizing: 'border-box',
    }}>
      <svg width={36} height={36} viewBox="0 0 24 24" fill="#fff">
        <path d="M17.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C3.25 17 1.85 12.45 3.66 9.4c.89-1.51 2.49-2.47 4.22-2.5 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.81M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontSize: 11, opacity: 0.85, letterSpacing: '0.4px' }}>Download on the</span>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.3px', marginTop: 2 }}>App Store</span>
      </div>
    </div>
  );
}

function GooglePlayBadge() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 12,
      background: '#000', color: '#fff',
      padding: '12px 22px', borderRadius: 14,
      height: 64, boxSizing: 'border-box',
    }}>
      <svg width={32} height={36} viewBox="0 0 25 27">
        <path d="M0.41 0.83C0.13 1.13 0 1.6 0 2.21v22.58c0 0.6 0.13 1.08 0.41 1.38l0.07 0.07L13.13 13.6v-0.27L0.48 0.76 0.41 0.83Z" fill="#00C3FF" />
        <path d="M17.34 17.83l-4.21-4.21v-0.27l4.21-4.21 0.10 0.05 4.99 2.84c1.43 0.81 1.43 2.13 0 2.94l-4.99 2.84-0.10 0.02Z" fill="#FFCD00" />
        <path d="M17.44 17.78l-4.31-4.31L0.41 26.17c0.47 0.50 1.25 0.56 2.13 0.07l14.90-8.46" fill="#FF3A44" />
        <path d="M17.44 9.16L2.54 0.70C1.66 0.21 0.88 0.27 0.41 0.77l12.72 12.70 4.31-4.31Z" fill="#00DD64" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span style={{ fontSize: 10, opacity: 0.85, letterSpacing: '0.6px' }}>GET IT ON</span>
        <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.3px', marginTop: 2 }}>Google Play</span>
      </div>
    </div>
  );
}

export const LandingGraphic = forwardRef<HTMLDivElement, LandingGraphicProps>(
  ({ locale, previewScale = 0.5 }, ref) => {
    const screens = SCREENS(locale);
    const copy = LANDING_COPY[locale] ?? LANDING_COPY.en;

    return (
      <div
        style={{
          width: W * previewScale,
          height: H * previewScale,
          overflow: 'hidden',
          borderRadius: 8,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div
          ref={ref}
          style={{
            width: W,
            height: H,
            transform: `scale(${previewScale})`,
            transformOrigin: 'top left',
            position: 'absolute', top: 0, left: 0,
            background: `linear-gradient(135deg, #FFEEDC 0%, #FBC9B6 50%, #F4D1D7 100%)`,
            fontFamily: "'Work Sans', system-ui, sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* Background blobs */}
          <div style={{
            position: 'absolute', top: -180, right: -150,
            width: 520, height: 520, borderRadius: '50%',
            background: COLORS.rose, opacity: 0.10, zIndex: 1,
          }} />
          <div style={{
            position: 'absolute', bottom: -260, left: -180,
            width: 620, height: 620, borderRadius: '50%',
            background: COLORS.coral, opacity: 0.10, zIndex: 1,
          }} />
          <div style={{
            position: 'absolute', top: 460, left: 460,
            width: 280, height: 280, borderRadius: '50%',
            background: COLORS.gold, opacity: 0.12, zIndex: 1,
          }} />

          {/* Top-left phone */}
          <div style={{
            position: 'absolute', top: 30, left: -10,
            transform: 'rotate(-10deg)', zIndex: 4,
            filter: 'drop-shadow(0 24px 44px rgba(0,0,0,0.18))',
          }}>
            <DeviceFrame screenshot={screens.topLeft} scale={0.78} />
          </div>

          {/* Top-right phone */}
          <div style={{
            position: 'absolute', top: 30, right: -10,
            transform: 'rotate(10deg)', zIndex: 4,
            filter: 'drop-shadow(0 24px 44px rgba(0,0,0,0.18))',
          }}>
            <DeviceFrame screenshot={screens.topRight} scale={0.78} />
          </div>

          {/* Title — top center between the two top phones */}
          <div style={{
            position: 'absolute',
            top: 40, left: 290, right: 290,
            textAlign: 'center', zIndex: 8,
          }}>
            <BrandLockup height={56} inline style={{ marginBottom: 16 }} />
            {'titleA' in copy ? (
              <div>
                <div style={{
                  fontSize: 56, fontWeight: 700, color: COLORS.ink,
                  lineHeight: 1.1, letterSpacing: '-1px', opacity: 0.9,
                }}>
                  {copy.titleA}
                </div>
                <div style={{
                  fontSize: 80, fontWeight: 800, color: COLORS.rose,
                  lineHeight: 1.05, letterSpacing: '-1.5px',
                  marginTop: 6,
                  textShadow: `0 6px 24px ${COLORS.rose}33`,
                }}>
                  {copy.titleB}
                </div>
              </div>
            ) : 'title' in copy ? (
              <h1 style={{
                fontSize: 52,
                fontWeight: 800, color: COLORS.ink,
                lineHeight: 1.1, margin: 0,
                letterSpacing: '-1.4px',
              }}>
                {renderTitle(copy.title, copy.highlight)}
              </h1>
            ) : null}
            <p style={{
              marginTop: 16, fontSize: 22,
              color: COLORS.ink, opacity: 0.78,
              fontWeight: 600, lineHeight: 1.4,
              maxWidth: 600, marginLeft: 'auto', marginRight: 'auto',
            }}>
              {copy.subtitle}
            </p>

            {/* App Store + Google Play badges */}
            <div style={{
              marginTop: 18,
              display: 'flex',
              gap: 14,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <AppStoreBadge />
              <GooglePlayBadge />
            </div>
          </div>

          {/* Bottom-left phone */}
          <div style={{
            position: 'absolute', top: 580, left: -10,
            transform: 'rotate(-6deg)', zIndex: 5,
            filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.20))',
          }}>
            <DeviceFrame screenshot={screens.bottomLeft} scale={0.92} />
          </div>

          {/* Bottom-center hero phone */}
          <div style={{
            position: 'absolute', top: 540, left: 440,
            zIndex: 7,
            filter: 'drop-shadow(0 36px 60px rgba(0,0,0,0.24))',
          }}>
            <DeviceFrame screenshot={screens.bottomCenter} scale={1.0} />
          </div>

          {/* Bottom-right phone */}
          <div style={{
            position: 'absolute', top: 580, right: -10,
            transform: 'rotate(6deg)', zIndex: 5,
            filter: 'drop-shadow(0 30px 50px rgba(0,0,0,0.20))',
          }}>
            <DeviceFrame screenshot={screens.bottomRight} scale={0.92} />
          </div>

          {/* Sparkle accents */}
          <div style={{
            position: 'absolute', top: 30, left: 280,
            fontSize: 32, opacity: 0.7, zIndex: 6,
          }}>✨</div>
          <div style={{
            position: 'absolute', top: 40, right: 290,
            fontSize: 28, opacity: 0.7, zIndex: 6,
          }}>⏰</div>
        </div>
      </div>
    );
  }
);

LandingGraphic.displayName = 'LandingGraphic';
