import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { Button, Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';

import { useCloudSync } from '../CloudSyncContext';
import { CLOUD_SYNC_ART } from './art';

/** Bringing this phone and the cloud copy together; waits for the network when offline. */
export function LinkingView() {
  const sync = useCloudSync();
  const offline = sync.lastError === 'offline';
  return (
    <View className="items-center gap-3 pt-10">
      <Image source={CLOUD_SYNC_ART} style={styles.art} resizeMode="contain" accessible={false} />
      {offline ? null : <ActivityIndicator size="large" className="mt-2" />}
      <Text variant="subheading" className="text-center" accessibilityLiveRegion="polite">
        {offline ? I18n.t('cloud_sync.errors.offline') : I18n.t('cloud_sync.linking')}
      </Text>
      <Text variant="body" tone="muted" className="text-center">
        {I18n.t('cloud_sync.linking_body')}
      </Text>
      {offline ? (
        <Button variant="ghost" size="sm" onPress={() => void sync.syncNow()}>
          <Text tone="muted">{I18n.t('common.retry')}</Text>
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { width: 260, height: 130 },
});
