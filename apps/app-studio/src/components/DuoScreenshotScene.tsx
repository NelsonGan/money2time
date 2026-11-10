import { forwardRef } from 'react';
import { Blob, Branch } from './flora';
import { DeviceScreen, SceneCanvas, SceneGlows, renderHeadline, oneLine, DISPLAY_FONT } from './sceneParts';
import { useFitText } from './useFitText';
import type { DuoSceneConfig } from '../scenes/duoSceneData';
import { DUO_EXPORT_WIDTH, DUO_EXPORT_HEIGHT } from '../utils/export';

interface DuoScreenshotSceneProps {
  scene: DuoSceneConfig;
  previewScale?: number;
}

const W = DUO_EXPORT_WIDTH;
const H = DUO_EXPORT_HEIGHT;
const INK = '#2F2521';

/** The inner display at the captures' own aspect ratio (2853 × 2007). */
const SCREEN_W = 2300;
const SCREEN_H = Math.round(SCREEN_W * (2007 / 2853));
const BEZEL = 24;
const RIM = 9;
const RADIUS = 84;

/**
 * The open iPhone Duo: titanium rim, thin black bezel, no camera cutout (the
 * inner display's camera sits under the panel), and a faint crease down the
 * middle where it folds.
 */
function DuoFrame({ screenshot }: { screenshot: string }) {
  return (
    <div style={{
      width: SCREEN_W + (BEZEL + RIM) * 2,
      height: SCREEN_H + (BEZEL + RIM) * 2,
      borderRadius: RADIUS + BEZEL + RIM,
      background: 'linear-gradient(150deg, #6e6e73 0%, #2c2c2e 30%, #48484d 55%, #1c1c1e 80%, #5a5a5f 100%)',
      padding: RIM,
      boxSizing: 'border-box',
      boxShadow: '0 90px 180px rgba(10,25,20,0.30), 0 28px 60px rgba(10,25,20,0.16)',
    }}>
      <div style={{
        width: '100%', height: '100%',
        borderRadius: RADIUS + BEZEL,
        background: '#0a0a0c',
        padding: BEZEL,
        boxSizing: 'border-box',
        position: 'relative',
      }}>
        <DeviceScreen screenshot={screenshot} width={SCREEN_W} height={SCREEN_H} borderRadius={RADIUS} />
        <div style={{
          position: 'absolute', top: BEZEL, bottom: BEZEL, left: '50%', width: 36,
          transform: 'translateX(-50%)', pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.035) 42%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.035) 58%, rgba(0,0,0,0) 100%)',
        }} />
      </div>
    </div>
  );
}

/**
 * Headline across the top, the open Duo below it bleeding off the bottom edge,
 * like the iPhone scenes turned on their side.
 */
export const DuoScreenshotScene = forwardRef<HTMLDivElement, DuoScreenshotSceneProps>(
  ({ scene, previewScale = 0.15 }, ref) => {
    const headlineRef = useFitText<HTMLHeadingElement>(150, 0.55);
    const headline = oneLine(scene.headline);
    const highlight = scene.highlight ? oneLine(scene.highlight) : undefined;

    return (
      <SceneCanvas
        ref={ref}
        width={W}
        height={H}
        previewScale={previewScale}
        background={`linear-gradient(170deg, #FBF2EA, ${scene.gradientTo})`}
      >
        <SceneGlows
          accent={scene.accentColor}
          top={{ inset: 420, size: 1500 }}
          bottom={{ bottomInset: 380, leftInset: 420, size: 1300 }}
        />
        <Branch x={-110} y={60} size={460} color={scene.accentColor} opacity={0.16} rotate={200} flip />
        <Blob x={2420} y={-140} size={560} color={scene.accentColor} opacity={0.10} rotate={18} />

        <h1 ref={headlineRef} style={{
          position: 'absolute', top: 118, left: 160, right: 160, zIndex: 6,
          fontFamily: DISPLAY_FONT,
          fontSize: 150, fontWeight: 800, color: INK,
          lineHeight: 1.08, margin: 0, textAlign: 'center',
          whiteSpace: 'pre-line', letterSpacing: '-3px',
        }}>
          {renderHeadline(headline, highlight, scene.accentColor, { offset: -16, height: 18 })}
        </h1>

        <div style={{
          position: 'absolute', top: 420, left: '50%',
          transform: 'translateX(-50%)', zIndex: 4,
        }}>
          <DuoFrame screenshot={scene.screenshot} />
        </div>
      </SceneCanvas>
    );
  },
);

DuoScreenshotScene.displayName = 'DuoScreenshotScene';
