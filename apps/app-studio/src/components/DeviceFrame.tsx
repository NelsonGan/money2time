import type { ReactNode } from 'react';
import { DeviceScreen } from './sceneParts';

interface DeviceFrameProps {
  screenshot?: string;
  children?: ReactNode;
  scale?: number;
}

export function DeviceFrame({ screenshot, children, scale = 1 }: DeviceFrameProps) {
  const width = 320 * scale;
  const height = 693 * scale;
  const outerRadius = 52 * scale;
  const bezel = 5 * scale;
  const rim = 2.5 * scale;

  return (
    <div
      style={{
        width: width + (bezel + rim) * 2,
        height: height + (bezel + rim) * 2,
        borderRadius: outerRadius + bezel + rim,
        // Titanium rim → dark bezel → screen
        background: 'linear-gradient(150deg, #6e6e73 0%, #2c2c2e 30%, #48484d 55%, #1c1c1e 80%, #5a5a5f 100%)',
        padding: rim,
        boxShadow: `0 ${40 * scale}px ${90 * scale}px rgba(10,25,20,0.35), 0 ${12 * scale}px ${28 * scale}px rgba(10,25,20,0.18)`,
        flexShrink: 0,
        boxSizing: 'content-box',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: outerRadius + bezel,
          background: '#0a0a0c',
          padding: bezel,
          boxSizing: 'border-box',
        }}
      >
        {children ? <div style={{ width, height, borderRadius: outerRadius, overflow: 'hidden', position: 'relative' }}>{children}</div> : <DeviceScreen
          screenshot={screenshot ?? ''}
          width={width}
          height={height}
          borderRadius={outerRadius}
        />}
      </div>
    </div>
  );
}
