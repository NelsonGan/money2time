import { forwardRef } from 'react';
import type { ReactNode, CSSProperties } from 'react';

/**
 * Pieces shared by the iPhone and iPad screenshot scenes. The two scenes lay
 * out their device and headline differently, so only the genuinely common
 * chrome lives here.
 */

const DISPLAY_FONT = "'Bricolage Grotesque', 'Work Sans', system-ui, sans-serif";
const BODY_FONT = "'Work Sans', system-ui, sans-serif";

export { DISPLAY_FONT, BODY_FONT };

/**
 * Renders `headline`, wrapping the first occurrence of `highlight` in accent
 * colour with an underline swash. Returns the plain string when there is no
 * highlight to apply.
 */
export function renderHeadline(
  headline: string,
  highlight: string | undefined,
  accent: string,
  underline: { offset: number; height: number } = { offset: -14, height: 16 },
): ReactNode {
  if (!highlight || !headline.includes(highlight)) return headline;

  const idx = headline.indexOf(highlight);
  return (
    <>
      {headline.slice(0, idx)}
      <span style={{ position: 'relative', display: 'inline-block', color: accent }}>
        {highlight}
        <span style={{
          position: 'absolute', left: '1%', right: '1%', bottom: underline.offset,
          height: underline.height, borderRadius: 100, background: accent, opacity: 0.9,
        }} />
      </span>
      {headline.slice(idx + highlight.length)}
    </>
  );
}

interface SceneCanvasProps {
  width: number;
  height: number;
  previewScale: number;
  background: string;
  children: ReactNode;
}

/**
 * Full-resolution export surface shown scaled down for preview. The outer div
 * is the preview-sized viewport; the inner div is the real export target and
 * receives the forwarded ref, so rasterization always captures full size.
 */
export const SceneCanvas = forwardRef<HTMLDivElement, SceneCanvasProps>(
  ({ width, height, previewScale, background, children }, ref) => (
    <div
      style={{
        width: width * previewScale,
        height: height * previewScale,
        overflow: 'hidden',
        borderRadius: 12,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div
        ref={ref}
        style={{
          width,
          height,
          transform: `scale(${previewScale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          background,
          fontFamily: BODY_FONT,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  ),
);
SceneCanvas.displayName = 'SceneCanvas';

interface SceneGlowsProps {
  accent: string;
  /** Top-right glow: inset from the top/right edges, and diameter. */
  top: { inset: number; size: number };
  /** Bottom-left glow: insets from the bottom/left edges, and diameter. */
  bottom: { bottomInset: number; leftInset: number; size: number };
}

/**
 * Soft accent-coloured radial glows plus an airy top light, for depth.
 * Positions are hand-tuned per scene and passed in explicitly — deriving them
 * from a single size would shift the composition.
 */
export function SceneGlows({ accent, top, bottom }: SceneGlowsProps) {
  const radial = `radial-gradient(circle, ${accent} 0%, transparent 68%)`;
  const glow: CSSProperties = { position: 'absolute', borderRadius: '50%', background: radial, zIndex: 1 };

  return (
    <>
      <div style={{
        ...glow,
        top: -top.inset, right: -top.inset,
        width: top.size, height: top.size, opacity: 0.14,
      }} />
      <div style={{
        ...glow,
        bottom: -bottom.bottomInset, left: -bottom.leftInset,
        width: bottom.size, height: bottom.size, opacity: 0.10,
      }} />
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 34%)',
      }} />
    </>
  );
}

interface DeviceScreenProps {
  screenshot: string;
  width: number;
  height: number;
  borderRadius: number;
}

/** The screen itself: a clipped, cover-fitted screenshot. */
export function DeviceScreen({ screenshot, width, height, borderRadius }: DeviceScreenProps) {
  return (
    <div style={{ width, height, borderRadius, overflow: 'hidden', background: '#000' }}>
      <img
        src={screenshot}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        crossOrigin="anonymous"
      />
    </div>
  );
}
