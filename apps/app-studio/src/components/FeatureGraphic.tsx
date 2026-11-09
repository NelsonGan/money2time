import { forwardRef } from 'react';
import { BrandLockup } from './BrandLockup';
import { DeviceFrame } from './DeviceFrame';
import { FEATURE_EXPORT_WIDTH, FEATURE_EXPORT_HEIGHT } from '../utils/export';
import { FEATURE_COPY, screenshotLocale } from '../scenes/locales';

interface FeatureGraphicProps {
  locale: string;
  previewScale?: number;
}

const W = FEATURE_EXPORT_WIDTH;
const H = FEATURE_EXPORT_HEIGHT;

const COLORS = {
  rose: '#B1525F',
  green: '#1F8A6F',
  gold: '#F6B750',
  coral: '#F37D57',
  ink: '#1A2E2A',
};

/** Dense scripts (CJK) read better a touch larger; everything else stays 44. */
const DENSE_TITLE = (locale: string) =>
  locale.endsWith('zh') || locale === 'ja' || locale === 'ko';

export const FeatureGraphic = forwardRef<HTMLDivElement, FeatureGraphicProps>(
  ({ locale, previewScale = 0.5 }, ref) => {
    const copy = FEATURE_COPY[locale] ?? FEATURE_COPY.en;
    const shotLocale = screenshotLocale(locale);
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
            position: 'absolute',
            top: 0,
            left: 0,
            background: `linear-gradient(135deg, #FFEEDC 0%, #FBC9B6 55%, #F8B19A 100%)`,
            fontFamily: "'Work Sans', system-ui, sans-serif",
            overflow: 'hidden',
          }}
        >
          {/* Background blobs */}
          <div style={{
            position: 'absolute', top: -120, right: -100,
            width: 400, height: 400, borderRadius: '50%',
            background: COLORS.rose, opacity: 0.10, zIndex: 1,
          }} />
          <div style={{
            position: 'absolute', bottom: -160, left: -80,
            width: 360, height: 360, borderRadius: '50%',
            background: COLORS.coral, opacity: 0.12, zIndex: 1,
          }} />
          <div style={{
            position: 'absolute', top: 200, left: 380,
            width: 220, height: 220, borderRadius: '50%',
            background: COLORS.gold, opacity: 0.10, zIndex: 1,
          }} />

          {/* Left: logo + tagline */}
          <div style={{
            position: 'absolute',
            left: 44, top: 60,
            width: 540,
            zIndex: 5,
          }}>
            <BrandLockup height={96} style={{ marginBottom: 30 }} />
            <h2 style={{
              fontSize: DENSE_TITLE(locale) ? 56 : 44,
              fontWeight: 800, color: COLORS.ink,
              lineHeight: 1.05, margin: 0,
              letterSpacing: '-1.2px',
            }}>
              {copy.titleA}
              <br />
              {copy.titleB.pre}
              <span style={{ color: COLORS.rose }}>{copy.titleB.hl}</span>
              {copy.titleB.post}
            </h2>
            <p style={{
              marginTop: 18, fontSize: 22,
              color: COLORS.ink, opacity: 0.7,
              fontWeight: 600, lineHeight: 1.3,
              fontStyle: 'italic',
            }}>
              <span style={{ marginRight: 8 }}>⏰</span>
              {copy.sub}
            </p>
          </div>

          {/* Right: two phones */}
          <div style={{
            position: 'absolute',
            top: 38, right: 110,
            zIndex: 4,
            transform: 'rotate(-6deg)',
          }}>
            <DeviceFrame
              screenshot={`/assets/screenshots-iphone/${shotLocale}/03-expense-breakdown.png`}
              scale={0.65}
            />
          </div>
          <div style={{
            position: 'absolute',
            top: 28, right: -10,
            zIndex: 5,
            transform: 'rotate(8deg)',
          }}>
            <DeviceFrame
              screenshot={`/assets/screenshots-iphone/${shotLocale}/01-home.png`}
              scale={0.65}
            />
          </div>

          {/* Accent dots/sparkles */}
          <div style={{
            position: 'absolute', left: 600, top: 30,
            width: 14, height: 14, borderRadius: '50%',
            background: COLORS.gold, zIndex: 6,
          }} />
          <div style={{
            position: 'absolute', left: 580, bottom: 60,
            width: 10, height: 10, borderRadius: '50%',
            background: COLORS.rose, zIndex: 6,
          }} />
          <div style={{
            position: 'absolute', right: 30, bottom: 30,
            width: 12, height: 12, borderRadius: '50%',
            background: COLORS.green, zIndex: 6,
          }} />
        </div>
      </div>
    );
  }
);

FeatureGraphic.displayName = 'FeatureGraphic';
