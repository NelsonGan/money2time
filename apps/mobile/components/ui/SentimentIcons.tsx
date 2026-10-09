import React from 'react';
import { View } from 'react-native';

import HappyEmoji from '~/assets/icons/happy-emoji.svg';
import NeutralEmoji from '~/assets/icons/neutral-emoji.svg';
import SadEmoji from '~/assets/icons/sad-emoji.svg';
import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import { useIsFlatIcons } from '~/context/ThemeContext';
import type { TransactionSentiment } from '~/types';

interface SentimentIconProps {
  size?: number;
}

/**
 * The three clay faces from `assets/clay-icons/sentiment/`, which replaced the
 * flat emoji SVGs. Both sets are kept: `settings.iconStyle` picks between them.
 */
const SENTIMENT_ICON: Record<TransactionSentiment, ClayIconName> = {
  happy: 'sentiment/happy',
  neutral: 'sentiment/neutral',
  sad: 'sentiment/regret',
};

/** Each flat SVG is a different fraction of its own viewbox; this evens them out. */
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
  const isFlat = useIsFlatIcons();
  if (isFlat) {
    return (
      <SentimentIconFrame size={size} scale={SENTIMENT_ICON_SCALE.happy}>
        <HappyEmoji width="100%" height="100%" />
      </SentimentIconFrame>
    );
  }
  return <ClayIcon name={SENTIMENT_ICON.happy} size={size} />;
}

export function NeutralSentimentIcon({ size = 24 }: SentimentIconProps) {
  const isFlat = useIsFlatIcons();
  if (isFlat) {
    return (
      <SentimentIconFrame size={size} scale={SENTIMENT_ICON_SCALE.neutral}>
        <NeutralEmoji width="100%" height="100%" />
      </SentimentIconFrame>
    );
  }
  return <ClayIcon name={SENTIMENT_ICON.neutral} size={size} />;
}

export function SadSentimentIcon({ size = 24 }: SentimentIconProps) {
  const isFlat = useIsFlatIcons();
  if (isFlat) {
    return (
      <SentimentIconFrame size={size} scale={SENTIMENT_ICON_SCALE.sad}>
        <SadEmoji width="100%" height="100%" />
      </SentimentIconFrame>
    );
  }
  return <ClayIcon name={SENTIMENT_ICON.sad} size={size} />;
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
