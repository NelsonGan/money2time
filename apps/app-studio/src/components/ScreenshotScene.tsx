import { forwardRef } from 'react';
import { DeviceFrame } from './DeviceFrame';
import { TriptychBackground } from './triptych';
import { SceneCanvas, SceneGlows, renderHeadline, DISPLAY_FONT } from './sceneParts';
import type { SceneConfig } from '../scenes/sceneData';
import { EXPORT_WIDTH, EXPORT_HEIGHT } from '../utils/export';
import { useFitText } from './useFitText';

interface ScreenshotSceneProps {
  scene: SceneConfig;
  previewScale?: number;
}

const SCENE_W = EXPORT_WIDTH;
const SCENE_H = EXPORT_HEIGHT;

export const ScreenshotScene = forwardRef<HTMLDivElement, ScreenshotSceneProps>(
  ({ scene, previewScale = 0.22 }, ref) => {
    const phoneScale = scene.phoneScale ?? 3.7;
    const phoneRotate = scene.phoneRotate ?? 0;
    const phoneX = scene.phoneX ?? 0;
    const phoneAnchor = scene.phoneAnchor ?? 'bottom';
    const phoneCrop = scene.phoneCrop ?? 520;
    const headlinePos = scene.headlinePos ?? 'top';
    const headlineSize = scene.headlineSize ?? 132;
    const headlineRef = useFitText<HTMLHeadingElement>(headlineSize, 0.4);

    return (
      <SceneCanvas
        ref={ref}
        width={SCENE_W}
        height={SCENE_H}
        previewScale={previewScale}
        background={scene.panorama
          ? scene.gradientFrom
          : `linear-gradient(${scene.gradientAngle ?? 170}deg, ${scene.gradientFrom}, ${scene.gradientTo})`}
      >
        {/* Background: shared panorama for triptych scenes, soft glows otherwise */}
        {scene.panorama ? (
          <TriptychBackground panel={scene.panorama.panel} />
        ) : (
          <SceneGlows
            accent={scene.accentColor}
            top={{ inset: 400, size: 1400 }}
            bottom={{ bottomInset: 300, leftInset: 500, size: 1300 }}
          />
        )}

        {/* Headline block */}
        {scene.headline && (
          <div style={{
            position: 'absolute',
            ...(headlinePos === 'top' ? { top: 120 } : { bottom: 150 }),
            left: 56, right: 56,
            textAlign: 'center', zIndex: 7,
          }}>
            {scene.badge && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 12,
                padding: '16px 34px', borderRadius: 100,
                background: scene.textColor, color: '#fff',
                fontSize: 30, fontWeight: 700,
                marginBottom: 40, letterSpacing: '2.5px',
                textTransform: 'uppercase',
                fontFamily: DISPLAY_FONT,
              }}>{scene.badge}</div>
            )}
            <h1 ref={headlineRef} style={{
              fontSize: headlineSize, fontWeight: 800, color: scene.textColor,
              lineHeight: 1.04, margin: 0,
              whiteSpace: 'pre-line', letterSpacing: '-3px',
              fontFamily: DISPLAY_FONT,
            }}>
              {renderHeadline(scene.headline, scene.highlight, scene.accentColor)}
            </h1>
          </div>
        )}

        {/* Phone — oversized, bleeding off one edge */}
        {scene.screenshot && (
          <div style={{
            position: 'absolute',
            ...(phoneAnchor === 'bottom' ? { bottom: -phoneCrop } : { top: -phoneCrop }),
            left: '50%',
            transform: `translateX(-50%) translateX(${phoneX}px) rotate(${phoneRotate}deg)`,
            transformOrigin: phoneAnchor === 'bottom' ? 'top center' : 'bottom center',
            zIndex: 3,
          }}>
            <DeviceFrame screenshot={scene.screenshot} scale={phoneScale} />
          </div>
        )}

        {/* Custom decorations — badges, chips, callouts */}
        {scene.decorations}
      </SceneCanvas>
    );
  }
);

ScreenshotScene.displayName = 'ScreenshotScene';
