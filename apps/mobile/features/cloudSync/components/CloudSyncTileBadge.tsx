import { Check } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { I18n } from '~/lib/i18n';

import { useCloudSync } from '../CloudSyncContext';

/** A small green tick on the Settings tile while Cloud Sync is on. */
export function CloudSyncTileBadge() {
  const { status } = useCloudSync();
  if (status !== 'ready') return null;
  return (
    <View
      accessibilityLabel={I18n.t('cloud_sync.tile_on')}
      className="h-[18px] w-[18px] items-center justify-center rounded-full bg-success"
    >
      <Check size={12} color="#fff" strokeWidth={3} />
    </View>
  );
}
