import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';

/**
 * Small themed "Shared" chip shown next to a split's item name wherever it
 * appears (Settle Up lists, drill-downs). The receipt image renders its own
 * fixed-palette badge, since it's captured outside the theme.
 */
export function SharedBadge() {
  return (
    <View className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5">
      <Text
        variant="caption"
        className="text-[10px] font-semibold uppercase tracking-wide text-primary"
      >
        {I18n.t('transactions.editor.split.shared_label')}
      </Text>
    </View>
  );
}
