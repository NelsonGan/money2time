import React from 'react';
import { View } from 'react-native';

import HappyEmoji from '~/assets/icons/happy-emoji.svg';
import NeutralEmoji from '~/assets/icons/neutral-emoji.svg';
import SadEmoji from '~/assets/icons/sad-emoji.svg';
import type { TransactionSentiment } from '~/types';

interface SentimentIconProps {
  size?: number;
}

const SENTIMENT_ICON_SCALE = {
  happy: 432 / 445,
  neutral: 399 / 445,
  sad: 1,
} as const;

function SentimentIconFrame({
  size = 24,
  scale,
  children,
}: React.PropsWithChildren<{ size?: number; scale: number }>) {
  const iconSize = size * scale;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: iconSize, height: iconSize }}>{children}</View>
    </View>
  );
}

export function HappySentimentIcon({ size = 24 }: SentimentIconProps) {
  return (
    <SentimentIconFrame size={size} scale={SENTIMENT_ICON_SCALE.happy}>
      <HappyEmoji width="100%" height="100%" />
    </SentimentIconFrame>
  );
}

export function NeutralSentimentIcon({ size = 24 }: SentimentIconProps) {
  return (
    <SentimentIconFrame size={size} scale={SENTIMENT_ICON_SCALE.neutral}>
      <NeutralEmoji width="100%" height="100%" />
    </SentimentIconFrame>
  );
}

export function SadSentimentIcon({ size = 24 }: SentimentIconProps) {
  return (
    <SentimentIconFrame size={size} scale={SENTIMENT_ICON_SCALE.sad}>
      <SadEmoji width="100%" height="100%" />
    </SentimentIconFrame>
  );
}

export function SentimentIcon({
  sentiment,
  size,
}: { sentiment: TransactionSentiment } & SentimentIconProps) {
  switch (sentiment) {
    case 'happy':
      return <HappySentimentIcon size={size} />;
    case 'sad':
      return <SadSentimentIcon size={size} />;
    case 'neutral':
    default:
      return <NeutralSentimentIcon size={size} />;
  }
}
