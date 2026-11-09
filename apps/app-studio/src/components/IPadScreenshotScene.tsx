import { forwardRef } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { Blob, Branch } from './flora';
import { SceneCanvas, SceneGlows, renderHeadline, DISPLAY_FONT } from './sceneParts';
import { useFitText, useFitLines } from './useFitText';
import type { IPadSceneConfig } from '../scenes/ipadSceneData';
import { IPAD_EXPORT_WIDTH, IPAD_EXPORT_HEIGHT } from '../utils/export';

interface IPadScreenshotSceneProps {
  scene: IPadSceneConfig;
  previewScale?: number;
}

const W = IPAD_EXPORT_WIDTH;
const H = IPAD_EXPORT_HEIGHT;

/**
 * Headline and proof points on the left, two phones on the right with the
 * front one overlapping. Copy is fitted rather than trusted to be short, since
 * the same layout carries twenty-three languages.
 */
export const IPadScreenshotScene = forwardRef<HTMLDivElement, IPadScreenshotSceneProps>(
  ({ scene, previewScale = 0.17 }, ref) => {
    const headlineRef = useFitText<HTMLHeadingElement>(132, 0.55);
    const subRef = useFitLines<HTMLParagraphElement>(52, 2);

    return (
      <SceneCanvas
        ref={ref}
        width={W}
        height={H}
        previewScale={previewScale}
        background={`linear-gradient(122deg, ${scene.gradientFrom}, ${scene.gradientTo})`}
      >
        <SceneGlows
          accent={scene.accentColor}
          top={{ inset: 420, size: 1500 }}
          bottom={{ bottomInset: 380, leftInset: 420, size: 1300 }}
        />
        <Branch x={-120} y={1480} size={520} color={scene.accentColor} opacity={0.16} rotate={-20} />
        <Blob x={2320} y={-180} size={620} color={scene.accentColor} opacity={0.09} rotate={18} />

        {/* Left column: headline, supporting line, three proof points */}
        <div style={{
          position: 'absolute', left: 132, top: 0, bottom: 0, width: 1130,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          zIndex: 6,
        }}>
          <h1 ref={headlineRef} style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 132, fontWeight: 800, color: scene.textColor,
            lineHeight: 1.08, margin: 0, whiteSpace: 'pre-line',
            letterSpacing: '-2px',
          }}>
            {renderHeadline(scene.headline, scene.highlight, scene.accentColor)}
          </h1>
          <p ref={subRef} style={{
            fontSize: 52, fontWeight: 600, color: scene.subColor,
            lineHeight: 1.35, margin: '44px 0 0', maxWidth: 1030,
          }}>{scene.subheadline}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 64 }}>
            {scene.bullets.map((bullet) => (
              <div key={bullet.text} style={{
                display: 'flex', alignItems: 'center', gap: 26,
                alignSelf: 'flex-start',
                background: '#FFFFFF', borderRadius: 999,
                padding: '18px 44px 18px 18px',
                boxShadow: '0 14px 34px rgba(47,37,33,0.10)',
                maxWidth: 1060,
              }}>
                <span style={{
                  width: 84, height: 84, borderRadius: '50%', flexShrink: 0,
                  background: `${scene.accentColor}1F`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 46,
                }}>{bullet.icon}</span>
                <span style={{
                  fontSize: 42, fontWeight: 700,
                  color: scene.textColor, lineHeight: 1.2,
                }}>{bullet.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: two phones, the front one overlapping */}
        <div style={{
          position: 'absolute', right: -60, top: 96, zIndex: 4,
          transform: 'rotate(-7deg)',
        }}>
          <DeviceFrame screenshot={scene.shots[0]} scale={2.5} />
        </div>
        <div style={{
          position: 'absolute', right: 630, top: 210, zIndex: 5,
          transform: 'rotate(4deg)',
        }}>
          <DeviceFrame screenshot={scene.shots[1]} scale={2.5} />
        </div>
      </SceneCanvas>
    );
  },
);

IPadScreenshotScene.displayName = 'IPadScreenshotScene';
