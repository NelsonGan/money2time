import React from 'react';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import type { TransactionSentiment } from '~/types';

interface SentimentIconProps {
  size?: number;
  color?: string;
}

export function HappySentimentIcon({ size = 24, color = '#F5A623' }: SentimentIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10.5} stroke={color} strokeWidth={1.5} />
      {/* Star left eye */}
      <Path
        d="M8 8.5l.6 1.2 1.4.2-1 1 .2 1.4L8 11.5l-1.2.8.2-1.4-1-1 1.4-.2z"
        fill={color}
      />
      {/* Star right eye */}
      <Path
        d="M16 8.5l.6 1.2 1.4.2-1 1 .2 1.4-1.2-.8-1.2.8.2-1.4-1-1 1.4-.2z"
        fill={color}
      />
      {/* Smile */}
      <Path
        d="M7.5 14.5c1 2.5 7.5 2.5 9 0"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function NeutralSentimentIcon({ size = 24, color = '#8E8E93' }: SentimentIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10.5} stroke={color} strokeWidth={1.5} />
      {/* Dot eyes */}
      <Circle cx={8.5} cy={10.5} r={1.3} fill={color} />
      <Circle cx={15.5} cy={10.5} r={1.3} fill={color} />
      {/* Straight mouth */}
      <Path
        d="M8.5 15.5h7"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SadSentimentIcon({ size = 24, color = '#5856D6' }: SentimentIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10.5} stroke={color} strokeWidth={1.5} />
      {/* Dot eyes */}
      <Circle cx={8.5} cy={10.5} r={1.3} fill={color} />
      <Circle cx={15.5} cy={10.5} r={1.3} fill={color} />
      {/* Tear drop */}
      <G>
        <Ellipse cx={17.2} cy={13} rx={0.8} ry={1.2} fill={color} opacity={0.5} />
      </G>
      {/* Frown */}
      <Path
        d="M8.5 17c1-2 5.5-2 7 0"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SentimentIcon({
  sentiment,
  size,
  color,
}: { sentiment: TransactionSentiment } & SentimentIconProps) {
  switch (sentiment) {
    case 'happy':
      return <HappySentimentIcon size={size} color={color} />;
    case 'sad':
      return <SadSentimentIcon size={size} color={color} />;
    case 'neutral':
    default:
      return <NeutralSentimentIcon size={size} color={color} />;
  }
}
