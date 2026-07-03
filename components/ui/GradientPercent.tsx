import React from 'react';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';

import { FONT } from '~/utils/fonts';

export function lightenColor(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const r = mix(Number.parseInt(value.slice(0, 2), 16));
  const g = mix(Number.parseInt(value.slice(2, 4), 16));
  const b = mix(Number.parseInt(value.slice(4, 6), 16));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function GradientPercent({
  label,
  color,
  gradientId,
}: {
  label: string;
  color: string;
  gradientId: string;
}) {
  const hasPercent = label.endsWith('%');
  const numberPart = hasPercent ? label.slice(0, -1) : label;
  const NUM_SIZE = 44;
  const PCT_SIZE = 24;
  const width = Math.ceil(
    numberPart.length * (NUM_SIZE * 0.6) + (hasPercent ? PCT_SIZE * 0.7 : 0) + 6,
  );
  const height = 50;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor={lightenColor(color, 0.22)} />
          <Stop offset="1" stopColor={color} />
        </SvgLinearGradient>
      </Defs>
      <SvgText
        x={0}
        y={height - 12}
        fill={`url(#${gradientId})`}
        fontFamily={FONT.monoBold}
        textAnchor="start"
      >
        <TSpan fontSize={NUM_SIZE} letterSpacing={-1}>
          {numberPart}
        </TSpan>
        {hasPercent ? (
          <TSpan fontSize={PCT_SIZE} dx={1}>
            %
          </TSpan>
        ) : null}
      </SvgText>
    </Svg>
  );
}
