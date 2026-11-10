import { forwardRef } from 'react';
import { Blob, Branch } from './flora';
import { DeviceScreen, SceneCanvas, SceneGlows, renderHeadline, oneLine, DISPLAY_FONT } from './sceneParts';
import { useFitText } from './useFitText';
import type { IPadSceneConfig } from '../scenes/ipadSceneData';
import { IPAD_EXPORT_WIDTH, IPAD_EXPORT_HEIGHT } from '../utils/export';

interface IPadScreenshotSceneProps {
  scene: IPadSceneConfig;
  previewScale?: number;
}

const W = IPAD_EXPORT_WIDTH;
const H = IPAD_EXPORT_HEIGHT;
const INK = '#2F2521';

/** The display at the captures' own aspect ratio (iPad Pro 13-inch, 4:3). */
const SCREEN_W = 2260;
const SCREEN_H = Math.round(SCREEN_W * (2064 / 2752));
const BEZEL = 38;
const RIM = 9;
const RADIUS = 52;

/**
 * A landscape tablet: thin aluminium rim, even black bezel and the front
 * camera centred on the top edge, as on an iPad Pro held sideways.
 */
function IPadFrame({ screenshot }: { screenshot: string }) {
  return (
    <div style={{
      width: SCREEN_W + (BEZEL + RIM) * 2,
      height: SCREEN_H + (BEZEL + RIM) * 2,
      borderRadius: RADIUS + BEZEL + RIM,
      background: 'linear-gradient(150deg, #d9d9de 0%, #a1a1a6 30%, #c7c7cc 55%, #8e8e93 80%, #d1d1d6 100%)',
      padding: RIM,
      boxSizing: 'border-box',
      boxShadow: '0 90px 180px rgba(10,25,20,0.28), 0 28px 60px rgba(10,25,20,0.15)',
    }}>
      <div style={{
        width: '100%', height: '100%',
        borderRadius: RADIUS + BEZEL,
        background: '#0a0a0c',
        padding: BEZEL,
        boxSizing: 'border-box',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute', top: BEZEL / 2 - 6, left: '50%', width: 12, height: 12,
          transform: 'translateX(-50%)', borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, #3a3f4a, #111318 70%)',
        }} />
        <DeviceScreen screenshot={screenshot} width={SCREEN_W} height={SCREEN_H} borderRadius={RADIUS} />
      </div>
    </div>
  );
}

/**
 * Headline across the top, the iPad below it bleeding off the bottom edge,
 * the same composition as the iPhone Duo scenes.
 */
export const IPadScreenshotScene = forwardRef<HTMLDivElement, IPadScreenshotSceneProps>(
  ({ scene, previewScale = 0.17 }, ref) => {
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
        <Blob x={2300} y={-140} size={560} color={scene.accentColor} opacity={0.10} rotate={18} />

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
          position: 'absolute', top: 410, left: '50%',
          transform: 'translateX(-50%)', zIndex: 4,
        }}>
          <IPadFrame screenshot={scene.screenshot} />
        </div>
      </SceneCanvas>
    );
  },
);

IPadScreenshotScene.displayName = 'IPadScreenshotScene';
