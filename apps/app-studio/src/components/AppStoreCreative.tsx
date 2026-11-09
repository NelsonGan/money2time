'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { APP_STORE_CREATIVE } from '../data/appStoreCreative';
import type { CreativePlacement } from '../data/appStoreCreative';
import { APP_STORE_COPY } from '../scenes/appStoreCreativeCopy';
import { PaymentAutomationPreview } from './PaymentAutomationPreview';
import { AppStorePhonePreview, STORE_PREVIEW } from './AppStorePhonePreview';
import { DISPLAY_FONT, BODY_FONT } from './sceneParts';
import { useFitText } from './useFitText';

const INK = '#2F2521';
const ROSE = '#B1525F';
const CREAM = '#FBF2EA';

function CreativeBackground() {
  return (
    <img src="/assets/app-store/header-city-farmland-open-center.png" alt="" aria-hidden="true"
      crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  );
}

interface Props {
  placement: CreativePlacement;
  locale: string;
  previewScale?: number;
  showSafeArea?: boolean;
  cropToSafeArea?: boolean;
  animatePayment?: boolean;
}

export const AppStoreCreative = forwardRef<HTMLDivElement, Props>(
  ({ placement, locale, previewScale = 0.24, showSafeArea = false, cropToSafeArea = false, animatePayment = true }, ref) => {
    const spec = APP_STORE_CREATIVE[placement];
    const copy = APP_STORE_COPY[locale] ?? APP_STORE_COPY.en;
    const isHeader = placement === 'header';
    const lines = copy.search;
    const titleRef = useFitText<HTMLHeadingElement>(276, 0.4);
    const viewport = cropToSafeArea ? spec.safe : { x: 0, y: 0, width: spec.width, height: spec.height };
    return (
      <div style={{ width: viewport.width * previewScale, height: viewport.height * previewScale,
        position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div ref={ref} data-creative={placement} data-search-locale={locale} lang={locale} style={{
          width: spec.width, height: spec.height, position: 'absolute', left: 0, top: 0,
          transform: `translate(${-viewport.x * previewScale}px, ${-viewport.y * previewScale}px) scale(${previewScale})`,
          transformOrigin: 'top left', overflow: 'hidden', color: INK, background: CREAM, fontFamily: BODY_FONT,
        }}>
          <div data-payment-static style={{ position: 'absolute', inset: 0 }}><CreativeBackground /></div>
          {isHeader ? (
            <>
              <img src="/assets/icons/money2time-wordmark.png" alt="Money2Time" crossOrigin="anonymous"
                data-creative-essential="wordmark" style={{ position: 'absolute', left: 640, top: 704,
                  width: 1800, height: 1800 * 243 / 1437 }} />
              <img src="/assets/app-store/header-mascot-wave.png" alt="" aria-hidden="true" crossOrigin="anonymous"
                data-creative-essential="mascot" style={{ position: 'absolute', left: 2500, top: 476,
                  width: 760, height: 760, objectFit: 'contain',
                  filter: 'drop-shadow(0 16px 28px rgba(116,67,48,0.07))' }} />
            </>
          ) : (
            <PaymentAutomationPreview locale={locale} animate={animatePayment} />
          )}
          {!isHeader && (
            <div data-payment-static style={{ position: 'absolute', left: 320, top: 1220, width: 1700, transform: 'translateY(-50%)' }}>
              <h1 ref={titleRef} data-creative-essential="headline" style={{
                fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 276,
                lineHeight: 1.06, letterSpacing: '-7px', whiteSpace: 'pre-line', margin: 0,
              }}>{lines[0]}{'\n'}<span style={{ color: ROSE }}>{lines[1]}</span></h1>
            </div>
          )}
        </div>
        {/* Guides live outside the export surface and cannot appear in downloads. */}
        {showSafeArea && !cropToSafeArea ? (
          <div aria-hidden="true" style={{
            position: 'absolute', left: spec.safe.x * previewScale, top: spec.safe.y * previewScale,
            width: spec.safe.width * previewScale, height: spec.safe.height * previewScale,
            border: '1px dashed #23846A', pointerEvents: 'none', boxSizing: 'border-box',
          }}><span style={{ position: 'absolute', top: -22, left: 0, font: '10px system-ui',
            background: '#23846A', color: '#fff', borderRadius: 3, padding: '3px 6px' }}>Apple art safe area</span></div>
        ) : null}
      </div>
    );
  },
);
AppStoreCreative.displayName = 'AppStoreCreative';

export function AppStoreCreativeView({ placement, locale, creativeRef, exporting = false }: {
  placement: CreativePlacement; locale: string; creativeRef: RefObject<HTMLDivElement | null>; exporting?: boolean;
}) {
  const [animatePayment, setAnimatePayment] = useState(true);
  const [paymentReplay, setPaymentReplay] = useState(0);
  const [showSafeArea, setShowSafeArea] = useState(true);
  const [previewMode, setPreviewMode] = useState<'store' | 'full' | 'safe' | 'card'>('store');
  const [availableWidth, setAvailableWidth] = useState(880);
  const containerRef = useRef<HTMLDivElement>(null);
  const spec = APP_STORE_CREATIVE[placement];
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  const activeMode = (placement === 'header' && previewMode === 'card')
    || (placement === 'search' && previewMode === 'safe') ? 'full' : previewMode;
  const cropToSafeArea = activeMode === 'safe';
  const showStorePreview = activeMode === 'store';
  const previewWidth = cropToSafeArea ? spec.safe.width : spec.width;
  const scale = showStorePreview
    ? (placement === 'header' ? STORE_PREVIEW.screenWidth : STORE_PREVIEW.searchCardWidth) / spec.width
    : Math.min(availableWidth / previewWidth,
      activeMode === 'card' ? STORE_PREVIEW.searchCardWidth / spec.width : cropToSafeArea ? 0.42 : 0.26);
  const previewOptions = [
    { mode: 'store' as const, label: 'App Store preview' },
    { mode: 'full' as const, label: 'Full image' },
    ...(placement === 'header' ? [{ mode: 'safe' as const, label: 'Safe area crop' }] : []),
    ...(placement === 'search' ? [{ mode: 'card' as const, label: 'Search card' }] : []),
  ];
  const creative = <AppStoreCreative key={`${locale}:${paymentReplay}`} placement={placement} locale={locale} ref={creativeRef} previewScale={scale}
    showSafeArea={placement === 'header' && showSafeArea && !showStorePreview} cropToSafeArea={cropToSafeArea} animatePayment={animatePayment} />;
  return (
    <div ref={containerRef} className="max-w-[1000px] mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#86bba4] font-semibold mb-2">App Store creative</p>
          <h2 className="text-[22px] tracking-tight font-semibold">{placement === 'header' ? 'Introduce Money2Time.' : 'Track expenses effortlessly.'}</h2>
          <p className="text-[13px] text-white/40 mt-2">{placement === 'header'
            ? 'A larger wordmark and a fresh, gently waving mascot.'
            : 'Apple Pay, a contactless terminal, and expenses recorded automatically.'}</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/[0.05] p-1" role="group" aria-label="Preview framing">
          {previewOptions.map(({ mode, label }) => (
            <button key={mode} onClick={() => setPreviewMode(mode)} disabled={exporting} aria-pressed={activeMode === mode}
              className={`text-[12px] px-3 py-2 rounded-md cursor-pointer disabled:cursor-not-allowed ${activeMode === mode ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/75'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {showStorePreview ? (
        <AppStorePhonePreview placement={placement} locale={locale} availableWidth={availableWidth}>
          {creative}
        </AppStorePhonePreview>
      ) : (
        <div style={{ width: previewWidth * scale }} className="mx-auto flex justify-center overflow-hidden rounded-2xl ring-1 ring-white/[0.08] bg-[#FBF2EA] shadow-2xl">
          {creative}
        </div>
      )}
      <div className="flex flex-wrap justify-between items-center gap-3 text-[12px] text-white/40">
        {placement === 'search' && <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={animatePayment} onChange={event => setAnimatePayment(event.target.checked)} disabled={exporting} className="accent-[#86bba4]" />Animate payment preview</label>
          <button type="button" disabled={exporting} onClick={() => { setAnimatePayment(true); setPaymentReplay(value => value + 1); }}
            className="cursor-pointer text-white/65 hover:text-white disabled:cursor-not-allowed">Replay</button>
        </div>}
        {placement === 'header' && !showStorePreview && <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showSafeArea} onChange={(event) => setShowSafeArea(event.target.checked)}
            disabled={cropToSafeArea || exporting} className="accent-[#86bba4]" />
          Show Apple safe area
        </label>}
        <p>{showStorePreview ? 'iPhone preview based on your App Store Connect examples.'
          : `${activeMode === 'card' ? '353 × 235 card preview. ' : ''}Exports contain the full image, without guides.`}</p>
      </div>
      <div className="rounded-xl border border-white/[0.07] p-4 text-[12px] leading-relaxed text-white/40">
        <span className="text-white/70">{placement === 'search' ? 'Export MP4' : 'Export JPEG'}</span> {placement === 'search' ? 'saves an 8-second, silent 1920 × 1280 video at 30 fps.' : `saves an opaque ${spec.width} × ${spec.height} image.`}
        {' '}<span className="text-white/65">Upload to Store</span> saves the same export to the {placement === 'header' ? 'Header' : 'Search Results'} field.
        {placement === 'search' && ' Search card shows the full image at phone size.'}
        {' '}The phone preview is an approximation. Use Apple’s Preview to check final placement.
      </div>
    </div>
  );
}
