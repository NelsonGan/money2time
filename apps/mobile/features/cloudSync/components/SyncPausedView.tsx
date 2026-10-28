import { CloudOff } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Card, FatButton, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import { useCloudSync } from '../CloudSyncContext';
import { AccountActions } from './AccountActions';
import { EmailPill } from './EmailPill';

/**
 * Pro has ended for the account: nothing syncs and nothing is deleted. Edits
 * made meanwhile are kept and go up by themselves once Pro is back.
 */
export function SyncPausedView({
  onOpenProPaywall,
}: {
  onOpenProPaywall: (source: string) => void;
}) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  return (
    <View className="gap-4 pt-2">
      <Card className="items-center gap-2 px-5 py-6">
        <CloudOff size={40} color={colors.textMuted} />
        <Text variant="subheading" className="text-center">
          {I18n.t('cloud_sync.not_pro_title')}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {I18n.t('cloud_sync.not_pro_body')}
        </Text>
        {sync.user?.email ? <EmailPill email={sync.user.email} /> : null}
      </Card>
      <FatButton
        color={colors.primary}
        label={I18n.t('cloud_sync.renew_pro')}
        onPress={() => onOpenProPaywall('cloud_sync')}
      />
      <AccountActions />
    </View>
  );
}
