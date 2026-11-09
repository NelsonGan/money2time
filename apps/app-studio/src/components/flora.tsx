/**
 * Organic background shapes — soft blobs and leafy branches that give the
 * scenes a gentle "flow" without competing with the device or headline.
 * Everything renders at low z-index behind the content.
 */

export function Blob({ x, y, size, color, opacity = 0.5, rotate = 0, zIndex = 1 }: {
  x: number; y: number; size: number; color: string;
  opacity?: number; rotate?: number; zIndex?: number;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      width: size, height: size * 0.94,
      background: color, opacity,
      transform: `rotate(${rotate}deg)`,
      borderRadius: '58% 42% 55% 45% / 52% 58% 42% 48%',
      pointerEvents: 'none',
    }} />
  );
}

export function Branch({ x, y, size = 360, color, opacity = 0.6, rotate = 0, flip = false, zIndex = 1 }: {
  x: number; y: number; size?: number; color: string;
  opacity?: number; rotate?: number; flip?: boolean; zIndex?: number;
}) {
  return (
    <svg
      style={{
        position: 'absolute', left: x, top: y, zIndex, opacity,
        transform: `rotate(${rotate}deg)${flip ? ' scaleX(-1)' : ''}`,
        pointerEvents: 'none',
      }}
      width={size} height={size * 1.4} viewBox="0 0 200 280" fill="none"
    >
      <path
        d="M104 274 C 108 214, 98 150, 72 28"
        stroke={color} strokeWidth={7} strokeLinecap="round"
      />
      <ellipse cx="140" cy="232" rx="38" ry="15" fill={color} transform="rotate(-24 140 232)" />
      <ellipse cx="68"  cy="204" rx="38" ry="15" fill={color} transform="rotate(28 68 204)" />
      <ellipse cx="132" cy="168" rx="36" ry="14" fill={color} transform="rotate(-28 132 168)" />
      <ellipse cx="56"  cy="134" rx="36" ry="14" fill={color} transform="rotate(30 56 134)" />
      <ellipse cx="116" cy="96"  rx="33" ry="13" fill={color} transform="rotate(-32 116 96)" />
      <ellipse cx="48"  cy="62"  rx="31" ry="12" fill={color} transform="rotate(34 48 62)" />
      <ellipse cx="72"  cy="18"  rx="26" ry="11" fill={color} transform="rotate(-70 72 18)" />
    </svg>
  );
}
