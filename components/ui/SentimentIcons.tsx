import React from 'react';

import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import type { TransactionSentiment } from '~/types';

interface SentimentIconProps {
  size?: number;
}

/**
 * The three clay faces from `assets/clay-icons/sentiment/`, which replaced the
 * flat `assets/icons/*-emoji.svg` glyphs. Like every clay icon they are
 * theme-neutral: the same artwork renders in light and dark.
 */
const SENTIMENT_ICON: Record<TransactionSentiment, ClayIconName> = {
  happy: 'sentiment/happy',
  neutral: 'sentiment/neutral',
  sad: 'sentiment/regret',
};

export function HappySentimentIcon({ size = 24 }: SentimentIconProps) {
  return <ClayIcon name={SENTIMENT_ICON.happy} size={size} />;
}

export function NeutralSentimentIcon({ size = 24 }: SentimentIconProps) {
  return <ClayIcon name={SENTIMENT_ICON.neutral} size={size} />;
}

export function SadSentimentIcon({ size = 24 }: SentimentIconProps) {
  return <ClayIcon name={SENTIMENT_ICON.sad} size={size} />;
}

export function SentimentIcon({
  sentiment,
  size = 24,
}: { sentiment: TransactionSentiment } & SentimentIconProps) {
  return <ClayIcon name={SENTIMENT_ICON[sentiment] ?? SENTIMENT_ICON.neutral} size={size} />;
}
