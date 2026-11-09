import type { ReactNode } from 'react';

export const DISPLAY_FONT = "'Bricolage Grotesque', 'Work Sans', system-ui, sans-serif";

interface PosProps {
  x: number;
  y: number;
  rotate?: number;
  zIndex?: number;
}

export function FloatingCard({
  x, y, rotate = 0, zIndex = 10, children,
  bg = '#fff', radius = 32, padding = '24px 32px',
  width, glow,
}: PosProps & {
  children: ReactNode;
  bg?: string;
  radius?: number;
  padding?: string;
  width?: number;
  glow?: string;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      transform: `rotate(${rotate}deg)`,
      background: bg, borderRadius: radius, padding,
      boxShadow: glow
        ? `0 24px 60px ${glow}55, 0 8px 16px rgba(0,0,0,0.06)`
        : '0 24px 60px rgba(0,0,0,0.10), 0 8px 16px rgba(0,0,0,0.04)',
      width,
    }}>{children}</div>
  );
}

export function BigPill({
  x, y, rotate = 0, zIndex = 10,
  text, sub, bg, color = '#fff',
  size = 'md', icon,
}: PosProps & {
  text: string;
  sub?: string;
  bg: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: ReactNode;
}) {
  const sizes = {
    sm: { fs: 50, pad: '20px 38px', radius: 100, subFs: 18, gap: 6 },
    md: { fs: 78, pad: '28px 50px', radius: 100, subFs: 26, gap: 8 },
    lg: { fs: 118, pad: '36px 60px', radius: 120, subFs: 32, gap: 10 },
    xl: { fs: 152, pad: '44px 76px', radius: 140, subFs: 38, gap: 12 },
  };
  const s = sizes[size];
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      transform: `rotate(${rotate}deg)`,
      background: bg, color,
      borderRadius: s.radius, padding: s.pad,
      fontWeight: 800, letterSpacing: '-1.5px',
      boxShadow: `0 28px 72px ${bg}55, 0 8px 16px rgba(0,0,0,0.10)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      lineHeight: 1, whiteSpace: 'nowrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: s.gap * 2 }}>
        {icon}
        <span style={{ fontSize: s.fs, lineHeight: 1, fontFamily: DISPLAY_FONT }}>{text}</span>
      </div>
      {sub && (
        <span style={{
          fontSize: s.subFs, fontWeight: 600, opacity: 0.92,
          marginTop: s.gap + 2, letterSpacing: '0.2px',
        }}>{sub}</span>
      )}
    </div>
  );
}

export function StatCard({
  x, y, rotate = 0, zIndex = 10,
  value, label, valueColor, bg = '#fff',
  icon, accentColor, width,
}: PosProps & {
  value: string;
  label: string;
  valueColor?: string;
  bg?: string;
  icon?: string;
  accentColor?: string;
  width?: number;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      transform: `rotate(${rotate}deg)`,
      background: bg, borderRadius: 32, padding: '26px 34px',
      boxShadow: '0 24px 60px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.05)',
      display: 'flex', alignItems: 'center', gap: 20,
      width,
    }}>
      {icon && (
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: accentColor ? `${accentColor}22` : '#F0F4F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, flexShrink: 0,
        }}>{icon}</div>
      )}
      <div>
        <div style={{
          fontSize: 22, fontWeight: 600, color: '#6B7A77',
          letterSpacing: '0.4px', textTransform: 'uppercase',
        }}>{label}</div>
        <div style={{
          fontSize: 44, fontWeight: 800,
          color: valueColor || '#1A2E2A',
          letterSpacing: '-1.2px', lineHeight: 1.05, marginTop: 4,
          fontFamily: DISPLAY_FONT,
        }}>{value}</div>
      </div>
    </div>
  );
}

export function Sparkle({
  x, y, size = 60, rotate = 0, color = '#fff', zIndex = 10,
}: PosProps & { size?: number; color?: string }) {
  return (
    <svg
      style={{
        position: 'absolute', left: x, top: y, zIndex,
        transform: `rotate(${rotate}deg)`,
        filter: `drop-shadow(0 6px 16px ${color}77)`,
      }}
      width={size} height={size} viewBox="0 0 24 24"
    >
      <path
        fill={color}
        d="M12 0 L13.5 9.5 L24 12 L13.5 14.5 L12 24 L10.5 14.5 L0 12 L10.5 9.5 Z"
      />
    </svg>
  );
}

export function Dot({
  x, y, size = 16, color = '#fff', zIndex = 10,
}: PosProps & { size?: number; color?: string }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      width: size, height: size, borderRadius: '50%', background: color,
    }} />
  );
}

export function Coin({
  x, y, size = 80, rotate = 0, zIndex = 10,
}: PosProps & { size?: number }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      width: size, height: size, borderRadius: '50%',
      background: 'radial-gradient(circle at 30% 28%, #FFE38A, #F4B72E 65%, #C88B14)',
      boxShadow: '0 14px 36px rgba(192, 139, 20, 0.4), inset 0 -6px 14px rgba(150,90,0,0.25)',
      transform: `rotate(${rotate}deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.55, fontWeight: 800, color: '#7A4F0A',
      fontFamily: 'system-ui, sans-serif',
      border: `${size * 0.04}px solid rgba(255, 222, 130, 0.95)`,
    }}>$</div>
  );
}

export function IconBubble({
  x, y, size = 110, bg = '#fff', emoji,
  rotate = 0, zIndex = 10, ring,
}: PosProps & {
  size?: number; bg?: string; emoji: string; ring?: string;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      width: size, height: size, borderRadius: '50%',
      background: bg, transform: `rotate(${rotate}deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5,
      boxShadow: '0 18px 44px rgba(0,0,0,0.13), 0 4px 12px rgba(0,0,0,0.06)',
      border: ring ? `${size * 0.04}px solid ${ring}` : 'none',
    }}>{emoji}</div>
  );
}

export function MiniRow({
  x, y, label, sub, value, valueColor,
  icon, iconBg, rotate = 0, width = 420, zIndex = 10,
}: PosProps & {
  label: string; sub?: string; value: string;
  valueColor?: string; icon?: string; iconBg?: string;
  width?: number;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex, width,
      transform: `rotate(${rotate}deg)`,
      background: '#fff', borderRadius: 28, padding: '24px 28px',
      boxShadow: '0 28px 72px rgba(0,0,0,0.12), 0 6px 12px rgba(0,0,0,0.04)',
      display: 'flex', alignItems: 'center', gap: 18,
    }}>
      {icon && (
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: iconBg || '#F0F4F2',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, flexShrink: 0,
        }}>{icon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 26, fontWeight: 700, color: '#1A2E2A',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{label}</div>
        {sub && (
          <div style={{
            fontSize: 20, fontWeight: 500, color: '#6B7A77', marginTop: 4,
          }}>{sub}</div>
        )}
      </div>
      <div style={{
        fontSize: 30, fontWeight: 800,
        color: valueColor || '#1A2E2A', whiteSpace: 'nowrap',
        fontFamily: DISPLAY_FONT,
      }}>{value}</div>
    </div>
  );
}

export function CategoryPill({
  x, y, label, percent, color, icon, rotate = 0, zIndex = 10,
}: PosProps & {
  label: string; percent: string; color: string; icon: string;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      transform: `rotate(${rotate}deg)`,
      background: '#fff', borderRadius: 100,
      padding: '14px 26px 14px 14px',
      boxShadow: '0 18px 44px rgba(0,0,0,0.10)',
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{
        width: 50, height: 50, borderRadius: '50%',
        background: `${color}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26,
      }}>{icon}</div>
      <span style={{ fontSize: 28, fontWeight: 700, color: '#1A2E2A' }}>{label}</span>
      <span style={{
        fontSize: 28, fontWeight: 800, color, marginLeft: 4,
      }}>{percent}</span>
    </div>
  );
}

export function ProgressRing({
  x, y, size = 280, percent = 42,
  color = '#1F8A6F', track = '#E0F5EE',
  centerText, subText, zIndex = 10, rotate = 0,
}: PosProps & {
  size?: number; percent?: number;
  color?: string; track?: string;
  centerText: string; subText?: string;
}) {
  const stroke = size * 0.10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      width: size, height: size,
      transform: `rotate(${rotate}deg)`,
      background: '#fff',
      borderRadius: '50%',
      boxShadow: '0 28px 72px rgba(0,0,0,0.14), 0 8px 16px rgba(0,0,0,0.06)',
    }}>
      <svg
        width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={track} strokeWidth={stroke} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontSize: size * 0.22, fontWeight: 800, color,
          letterSpacing: '-1.5px', lineHeight: 1,
          fontFamily: DISPLAY_FONT,
        }}>{centerText}</div>
        {subText && (
          <div style={{
            fontSize: size * 0.072, fontWeight: 700,
            color: '#6B7A77', marginTop: 8, letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}>{subText}</div>
        )}
      </div>
    </div>
  );
}

export function Squiggle({
  x, y, color = '#000', stroke = 8,
  length = 200, rotate = 0, zIndex = 10,
}: PosProps & {
  color?: string; stroke?: number; length?: number;
}) {
  return (
    <svg
      style={{
        position: 'absolute', left: x, top: y, zIndex,
        transform: `rotate(${rotate}deg)`,
      }}
      width={length} height={40} viewBox="0 0 200 40"
    >
      <path
        d="M0 20 Q 25 4, 50 20 T 100 20 T 150 20 T 200 20"
        stroke={color} strokeWidth={stroke}
        fill="none" strokeLinecap="round"
      />
    </svg>
  );
}

export function CurvedArrow({
  x, y, color = '#000', size = 120,
  rotate = 0, zIndex = 10, dashed = true,
}: PosProps & {
  color?: string; size?: number; dashed?: boolean;
}) {
  return (
    <svg
      style={{
        position: 'absolute', left: x, top: y, zIndex,
        transform: `rotate(${rotate}deg)`,
      }}
      width={size} height={size} viewBox="0 0 100 100"
    >
      <path
        d="M8 78 Q 50 50, 86 50"
        stroke={color} strokeWidth="6" fill="none"
        strokeLinecap="round"
        strokeDasharray={dashed ? '4 8' : undefined}
      />
      <path
        d="M76 40 L88 50 L76 60"
        stroke={color} strokeWidth="6" fill="none"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export function Heart({
  x, y, size = 60, color = '#F37D57',
  rotate = 0, zIndex = 10,
}: PosProps & { size?: number; color?: string }) {
  return (
    <svg
      style={{
        position: 'absolute', left: x, top: y, zIndex,
        transform: `rotate(${rotate}deg)`,
        filter: `drop-shadow(0 4px 12px ${color}55)`,
      }}
      width={size} height={size} viewBox="0 0 24 24"
    >
      <path
        fill={color}
        d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"
      />
    </svg>
  );
}

export function Confetti({
  x, y, color, size = 28, rotate = 0, zIndex = 10,
}: PosProps & { color: string; size?: number }) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      width: size * 0.4, height: size, background: color,
      borderRadius: 4, transform: `rotate(${rotate}deg)`,
    }} />
  );
}

export function HugeText({
  x, y, text, color, size = 320,
  rotate = 0, zIndex = 1, opacity = 0.08,
  weight = 900, italic,
}: PosProps & {
  text: string; color: string; size?: number;
  opacity?: number; weight?: number; italic?: boolean;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      transform: `rotate(${rotate}deg)`,
      fontSize: size, fontWeight: weight, color,
      opacity, lineHeight: 1, letterSpacing: '-12px',
      fontStyle: italic ? 'italic' : 'normal',
      pointerEvents: 'none', userSelect: 'none',
    }}>{text}</div>
  );
}

export function Tag({
  x, y, text, bg, color = '#fff',
  rotate = 0, zIndex = 10, fontSize = 26,
}: PosProps & {
  text: string; bg: string; color?: string; fontSize?: number;
}) {
  return (
    <div style={{
      position: 'absolute', left: x, top: y, zIndex,
      transform: `rotate(${rotate}deg)`,
      background: bg, color,
      borderRadius: 100, padding: '12px 22px',
      fontSize, fontWeight: 700, letterSpacing: '0.3px',
      boxShadow: `0 12px 28px ${bg}55`,
      whiteSpace: 'nowrap',
    }}>{text}</div>
  );
}
