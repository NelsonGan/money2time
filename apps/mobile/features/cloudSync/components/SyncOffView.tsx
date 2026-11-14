import React, { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';

import { Card, FatButton, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { useCloudSync } from '../CloudSyncContext';
import { errorMessage, kindMessage } from '../lib/messages';
import { CLOUD_SYNC_ART } from './art';
import { EmailPill } from './EmailPill';

/**
 * Signed in, Cloud Sync off: a sign-in never starts syncing by itself. Turn on
 * links this phone and the cloud copy; a free account gets Get Pro instead.
 */
export function SyncOffView({ onOpenProPaywall }: { onOpenProPaywall: (source: string) => void }) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const [busy, setBusy] = useState(false);

  const turnOn = () => {
    void triggerHaptic('selection');
    setBusy(true);
    sync
      .turnOnSync()
      .then((result) => {
        if (result === 'needsPro') onOpenProPaywall('cloud_sync');
      })
      .catch((e: unknown) => Alert.alert(I18n.t('cloud_sync.title'), errorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <View className="gap-4 pt-2">
      <Card className="items-center gap-2 px-5 py-6">
        <Image source={CLOUD_SYNC_ART} style={styles.art} resizeMode="contain" accessible={false} />
        <Text variant="subheading" className="text-center">
          {I18n.t('cloud_sync.off_title')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {I18n.t('cloud_sync.off_body')}
        </Text>
        {sync.lastError ? (
          <Text variant="caption" tone="error" className="text-center">
            {kindMessage(sync.lastError)}
          </Text>
        ) : null}
        {sync.user?.email ? <EmailPill email={sync.user.email} /> : null}
      </Card>
      <FatButton
        color={colors.primary}
        label={I18n.t('cloud_sync.turn_on')}
        loading={busy}
        disabled={busy}
        onPress={turnOn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  art: { width: 220, height: 110 },
});
