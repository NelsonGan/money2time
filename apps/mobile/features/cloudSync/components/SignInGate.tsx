import React from 'react';
import { View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Text } from '~/components/ui';

import { useCloudSync } from '../CloudSyncContext';
import { KeepDataChoice } from './KeepDataChoice';
import { SignedOutView } from './SignedOutView';

/** An account is signed in, and past any choice between this phone and the cloud copy. */
export function useSignedIn(): boolean {
  const { status } = useCloudSync();
  return status === 'ready' || status === 'notPro';
}

/**
 * What stands before something that needs an account, Pro or not (joining a
 * shared ledger or album, sharing an album): the sign-in options under
 * `prompt`, then a Pro user's choice between this phone and the cloud copy.
 * For while `useSignedIn` is false.
 */
export function SignInGate({ prompt }: { prompt: string }) {
  const sync = useCloudSync();
  if (sync.status === 'needsChoice' && sync.choice) {
    return <KeepDataChoice choice={sync.choice} />;
  }
  if (sync.status === 'signedOut' || sync.status === 'unavailable') {
    return (
      <View className="gap-2">
        <Text variant="body" tone="muted" className="text-center">
          {prompt}
        </Text>
        <SignedOutView hideHero />
      </View>
    );
  }
  return (
    <View className="items-center py-4">
      <LoadingDots />
    </View>
  );
}
