import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';

import { type CloudSyncStatus, useCloudSync } from '../CloudSyncContext';
import { CloudSyncFaq } from '../components/CloudSyncFaq';
import { KeepDataChoice } from '../components/KeepDataChoice';
import { LinkingView } from '../components/LinkingView';
import { SignedOutView } from '../components/SignedOutView';
import { SyncLoader } from '../components/SyncLoader';
import { SyncPausedView } from '../components/SyncPausedView';
import { SyncStatusView } from '../components/SyncStatusView';

const VIEWED_KEY = 'm2t.cloudSync.screenViewed.v1';

/** Analytics values for the status the screen first settles on. */
const VIEWED_STATUS: Partial<Record<CloudSyncStatus, string>> = {
  signedOut: 'signed_out',
  linking: 'linking',
  needsChoice: 'needs_choice',
  ready: 'ready',
  notPro: 'not_pro',
};

let viewedThisLaunch = false;

/**
 * Sends `Cloud Sync Screen Viewed` the first time this install opens the
 * screen, once its status is known, so the rollout's exposure is measurable.
 */
function useTrackFirstView(status: CloudSyncStatus) {
  const viewedStatus = VIEWED_STATUS[status];
  useEffect(() => {
    if (!viewedStatus || viewedThisLaunch) return;
    viewedThisLaunch = true;
    void (async () => {
      const seen = await AsyncStorage.getItem(VIEWED_KEY).catch(() => null);
      if (seen) return;
      await AsyncStorage.setItem(VIEWED_KEY, String(Date.now())).catch(() => undefined);
      void trackEvent(AnalyticsEvents.CLOUD_SYNC_SCREEN_VIEWED, { status: viewedStatus });
    })();
  }, [viewedStatus]);
}

interface CloudSyncScreenProps {
  onBack: () => void;
  onOpenProPaywall: (source: string) => void;
}

/** Settings > Cloud Sync: one view per state of the provider. */
export function CloudSyncScreen({ onBack, onOpenProPaywall }: CloudSyncScreenProps) {
  const sync = useCloudSync();
  const bottomNavInset = useSettingsBottomNavInset();
  useTrackFirstView(sync.status);

  let content: React.ReactNode;
  switch (sync.status) {
    case 'loading':
    case 'unavailable':
      // Where the sign-in hero's art sits, so the page does not jump when
      // the state arrives.
      content = (
        <View style={styles.center}>
          <SyncLoader width={280} accessibilityLabel={I18n.t('common.loading')} />
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
      content = <SignedOutView />;
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
        {/* Not while linking or choosing: those screens ask for one thing. */}
        {sync.status === 'signedOut' || sync.status === 'ready' || sync.status === 'notPro' ? (
          <CloudSyncFaq />
        ) : null}
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
    paddingTop: 4,
    alignItems: 'center',
  },
});
