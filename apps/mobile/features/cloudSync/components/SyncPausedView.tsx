import { CloudOff, Users } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Card, FatButton, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import { useSharedLedgers } from '../../sharedLedgers/hooks/useSharedLedgers';
import { useCloudSync } from '../CloudSyncContext';
import { AccountActions } from './AccountActions';
import { EmailPill } from './EmailPill';

/**
 * Pro has ended for the account (or it never had Pro): the user's own data
 * does not sync and nothing is deleted. Edits made meanwhile are kept and go
 * up by themselves once Pro is back. Ledgers others shared with the user
 * still sync, which the view says when there are any.
 */
export function SyncPausedView({
  onOpenProPaywall,
}: {
  onOpenProPaywall: (source: string) => void;
}) {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const joined = useSharedLedgers().filter((ledger) => ledger.role === 'member');
  const member = joined.length > 0;
  // Signed in without Pro and never synced: not a pause but a start.
  const fresh = !sync.linked;
  // The account is Pro, but its Pro already reaches 5 more recently used phones.
  const limited = sync.phoneLimited;
  const title = limited
    ? I18n.t('cloud_sync.phone_limit_title')
    : member
      ? I18n.t('shared_ledgers.member_sync_title')
      : fresh
        ? I18n.t('cloud_sync.needs_pro_title')
        : I18n.t('cloud_sync.not_pro_title');
  const body = limited
    ? I18n.t('cloud_sync.phone_limit_body')
    : member
      ? I18n.t('shared_ledgers.member_sync_body', {
          names: joined.map((ledger) => ledger.name ?? '').join(', '),
        })
      : fresh
        ? I18n.t('cloud_sync.needs_pro_body')
        : I18n.t('cloud_sync.not_pro_body');
  return (
    <View className="gap-4 pt-2">
      <Card className="items-center gap-2 px-5 py-6">
        {member && !limited ? (
          <Users size={40} color={colors.primary} />
        ) : (
          <CloudOff size={40} color={colors.textMuted} />
        )}
        <Text variant="subheading" className="text-center">
          {title}
        </Text>
        <Text variant="body" tone="muted" className="text-center">
          {body}
        </Text>
        {member && sync.lastError ? (
          // The joined ledgers are what syncs here: say when they cannot.
          <Text variant="caption" tone="warning" className="text-center">
            {I18n.t(
              sync.lastError === 'offline'
                ? 'cloud_sync.status_offline'
                : 'cloud_sync.status_error',
            )}
          </Text>
        ) : null}
        {sync.user?.email ? <EmailPill email={sync.user.email} /> : null}
      </Card>
      <FatButton
        color={colors.primary}
        label={
          member || fresh || limited
            ? I18n.t('shared_ledgers.get_pro')
            : I18n.t('cloud_sync.renew_pro')
        }
        onPress={() => onOpenProPaywall('cloud_sync')}
      />
      <AccountActions />
    </View>
  );
}
