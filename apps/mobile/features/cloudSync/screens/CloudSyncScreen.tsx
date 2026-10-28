import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import {
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { I18n } from '~/lib/i18n';

import { useCloudSync } from '../CloudSyncContext';
import { KeepDataChoice } from '../components/KeepDataChoice';
import { LinkingView } from '../components/LinkingView';
import { SignedOutView } from '../components/SignedOutView';
import { SyncPausedView } from '../components/SyncPausedView';
import { SyncStatusView } from '../components/SyncStatusView';

interface CloudSyncScreenProps {
  onBack: () => void;
  onOpenProPaywall: (source: string) => void;
}

/** Settings > Cloud Sync: one view per state of the provider. */
export function CloudSyncScreen({ onBack, onOpenProPaywall }: CloudSyncScreenProps) {
  const sync = useCloudSync();
  const bottomNavInset = useSettingsBottomNavInset();

  let content: React.ReactNode;
  switch (sync.status) {
    case 'loading':
    case 'unavailable':
      content = (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      );
      break;
    case 'linking':
      content = <LinkingView />;
      break;
    case 'needsChoice':
      // The provider sets the choice together with this status.
      content = sync.choice ? <KeepDataChoice choice={sync.choice} /> : <LinkingView />;
      break;
    case 'ready':
      content = <SyncStatusView />;
      break;
    case 'notPro':
      content = <SyncPausedView onOpenProPaywall={onOpenProPaywall} />;
      break;
    case 'signedOut':
      content = <SignedOutView onOpenProPaywall={onOpenProPaywall} />;
      break;
  }

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('cloud_sync.title')}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingTop: 4,
  },
  center: {
    paddingTop: 80,
    alignItems: 'center',
  },
});
