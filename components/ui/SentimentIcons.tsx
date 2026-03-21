import React from 'react';

import HappyEmoji from '~/assets/icons/happy-emoji.svg';
import NeutralEmoji from '~/assets/icons/neutral-emoji.svg';
import SadEmoji from '~/assets/icons/sad-emoji.svg';
import type { TransactionSentiment } from '~/types';

interface SentimentIconProps {
  size?: number;
}

export function HappySentimentIcon({ size = 24 }: SentimentIconProps) {
  return <HappyEmoji width={size} height={size} />;
}

export function NeutralSentimentIcon({ size = 24 }: SentimentIconProps) {
  return <NeutralEmoji width={size} height={size} />;
}

export function SadSentimentIcon({ size = 24 }: SentimentIconProps) {
  return <SadEmoji width={size} height={size} />;
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
