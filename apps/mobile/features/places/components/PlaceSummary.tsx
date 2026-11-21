import { View } from 'react-native';

import { Text } from '~/components/ui/text';

export interface PlaceSummaryData {
  /** The money: spent, or earned where nothing was spent. */
  value: string;
  tone: 'primary' | 'success' | 'muted';
  /** The rest in one quiet line: hours of work, money in, visits. */
  details: readonly string[];
}

/**
 * The spending map's figures for a period or a place: one large amount, the
 * rest as a single muted line under it.
 */
export function PlaceSummary({ value, tone, details }: PlaceSummaryData) {
  return (
    <View>
      <Text
        variant="title"
        tone={tone}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      {details.length > 0 ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {details.join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}
