import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

interface StorePlatformIconProps {
  size?: number;
  color?: string;
  cutoutColor?: string;
}

/** Apple mark used on the iOS RiceCal store link. */
export function AppleStoreIcon({ size = 22, color = '#fff' }: StorePlatformIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 384 512">
      <Path
        fill={color}
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5 4 312 18 352.5 31.8 382.2c18.4 39.5 42.5 83.9 77.2 82.3 27.1-.7 37.3-17.6 69.7-17.6 31.4 0 40.5 17.6 69 17.6 35.1-.5 57.6-40.3 75-79.8 20.1-45.6 28.4-89.8 28.7-92-42.7-20.1-32.5-61.6-32.7-64zM260.7 104.5C288 72.1 285.4 40.8 284.6 29c-24 1.4-51.9 16.4-67.7 34.8-17.4 19.7-27.6 44-25.4 74.9 26 .2 49.8-11.4 69.2-34.2z"
      />
    </Svg>
  );
}

/** Android robot mark used on the Play Store RiceCal link. */
export function AndroidStoreIcon({
  size = 22,
  color = '#fff',
  cutoutColor = '#000',
}: StorePlatformIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Line x1={8} y1={5.5} x2={6.5} y2={3} stroke={color} strokeWidth={1.4} />
      <Line x1={16} y1={5.5} x2={17.5} y2={3} stroke={color} strokeWidth={1.4} />
      <Path fill={color} d="M6 9a6 6 0 0 1 12 0v1H6V9z" />
      <Rect x={6} y={10.5} width={12} height={8} rx={1.5} fill={color} />
      <Rect x={3.5} y={10.5} width={2} height={7} rx={1} fill={color} />
      <Rect x={18.5} y={10.5} width={2} height={7} rx={1} fill={color} />
      <Rect x={8} y={17} width={2.2} height={4} rx={1.1} fill={color} />
      <Rect x={13.8} y={17} width={2.2} height={4} rx={1.1} fill={color} />
      <Circle cx={9.2} cy={7.7} r={0.65} fill={cutoutColor} />
      <Circle cx={14.8} cy={7.7} r={0.65} fill={cutoutColor} />
    </Svg>
  );
}
