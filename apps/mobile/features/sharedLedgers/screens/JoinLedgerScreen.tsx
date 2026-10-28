import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useCloudSync, useCloudSyncEnabled } from '~/features/cloudSync/CloudSyncContext';
import { KeepDataChoice } from '~/features/cloudSync/components/KeepDataChoice';
import { SignedOutView } from '~/features/cloudSync/components/SignedOutView';
import { type InvitePreview, previewInvite } from '~/features/cloudSync/services/sharedLedgersApi';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { SharedLedgerHero } from '../components/SharedLedgerHero';
import { sharingErrorMessage } from '../lib/sharing';

interface JoinLedgerScreenProps {
  code: string;
  onClose: () => void;
  /** After joining: the ledger is open, go to the app. */
  onJoined: () => void;
}

/**
 * Where an invite link lands: what the ledger is and who shares it, a sign-in
 * if needed (anyone can join, Pro or not), then Join.
 */
export function JoinLedgerScreen({ code, onClose, onJoined }: JoinLedgerScreenProps) {
  const enabled = useCloudSyncEnabled();
  const sync = useCloudSync();
  const { switchLedger } = useApp();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewInvite(code)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(sharingErrorMessage(e, 'join'));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const join = async () => {
    void triggerHaptic('selection');
    setError(null);
    setJoining(true);
    try {
      const ledgerId = await sync.joinLedger(code);
      void triggerHaptic('success');
      switchLedger(ledgerId);
      onJoined();
    } catch (e) {
      setError(sharingErrorMessage(e, 'join'));
      setJoining(false);
    }
  };

  const signedIn = sync.user !== null && sync.status !== 'signedOut';

  let action: React.ReactNode;
  if (!enabled) {
    action = (
      <Text variant="body" tone="muted" className="text-center">
        {I18n.t('shared_ledgers.join_unavailable')}
      </Text>
    );
  } else if (!preview) {
    action = null;
  } else if (!preview.active) {
    action = (
      <Text variant="body" tone="muted" className="text-center">
        {I18n.t('shared_ledgers.join_paused')}
      </Text>
    );
  } else if (preview.full) {
    action = (
      <Text variant="body" tone="muted" className="text-center">
        {I18n.t('shared_ledgers.join_full')}
      </Text>
    );
  } else if (sync.status === 'loading' || sync.status === 'linking') {
    action = <ActivityIndicator />;
  } else if (sync.status === 'needsChoice' && sync.choice) {
    // A Pro user signing in here first settles their own data, as on the Cloud Sync screen.
    action = <KeepDataChoice choice={sync.choice} />;
  } else if (!signedIn) {
    action = (
      <View className="gap-2">
        <Text variant="body" tone="muted" className="text-center">
          {I18n.t('shared_ledgers.join_sign_in')}
        </Text>
        <SignedOutView hideHero />
      </View>
    );
  } else {
    action = (
      <View className="gap-2">
        <Button testID="ledger-join" onPress={() => void join()} disabled={joining}>
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text>{I18n.t('shared_ledgers.join_button', { name: preview.name })}</Text>
          )}
        </Button>
        {sync.user?.email ? (
          <Text variant="caption" tone="muted" className="text-center">
            {I18n.t('shared_ledgers.join_as', { email: sync.user.email })}
          </Text>
        ) : null}
        <Text variant="caption" tone="muted" className="text-center">
          {I18n.t('shared_ledgers.join_note')}
        </Text>
      </View>
    );
  }

  return (
    <SettingsPageLayout>
      <SettingsHeader title={I18n.t('shared_ledgers.join_title')} onBack={onClose} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingTop: 4,
          paddingBottom: insets.bottom + 24,
          gap: 20,
        }}
      >
        <SharedLedgerHero icon={preview?.emoji ?? null} />
        {preview ? (
          <Card className="items-center gap-1 px-5 py-5">
            <Text variant="title" className="text-center" numberOfLines={2}>
              {preview.name}
            </Text>
            <Text variant="body" tone="muted" className="text-center">
              {I18n.t('shared_ledgers.join_from', { owner: preview.ownerName })}
            </Text>
            <Text variant="caption" tone="muted" className="text-center">
              {I18n.t(
                preview.memberCount + 1 === 1
                  ? 'shared_ledgers.people_one'
                  : 'shared_ledgers.people_other',
                { count: preview.memberCount + 1 },
              )}
            </Text>
          </Card>
        ) : error ? null : (
          <View className="items-center py-6">
            <ActivityIndicator />
          </View>
        )}
        {error ? (
          <Text variant="body" tone="error" className="text-center">
            {error}
          </Text>
        ) : null}
        {action}
      </ScrollView>
    </SettingsPageLayout>
  );
}
