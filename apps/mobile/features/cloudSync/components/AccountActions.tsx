import { ChevronRight, LogOut, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Card, LoadingDots, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import { useSharedLedgers } from '../../sharedLedgers/hooks/useSharedLedgers';
import { useCloudSync } from '../CloudSyncContext';
import { errorMessage } from '../lib/messages';

/** Sign out and Delete account, each behind a confirmation. Shown whenever signed in. */
export function AccountActions() {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const ownsShared = useSharedLedgers().some((ledger) => ledger.role === 'owner');
  const [busy, setBusy] = useState<'sign_out' | 'delete' | null>(null);

  const run = (action: 'sign_out' | 'delete', work: () => Promise<void>) => {
    setBusy(action);
    work()
      .catch((e: unknown) => Alert.alert(I18n.t('cloud_sync.title'), errorMessage(e)))
      .finally(() => setBusy(null));
  };

  const confirmSignOut = () =>
    Alert.alert(
      I18n.t('cloud_sync.sign_out_confirm_title'),
      I18n.t('cloud_sync.sign_out_confirm_body'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        { text: I18n.t('cloud_sync.sign_out'), onPress: () => run('sign_out', sync.signOut) },
      ],
    );

  const confirmDelete = () =>
    Alert.alert(
      I18n.t('cloud_sync.delete_confirm_title'),
      ownsShared
        ? `${I18n.t('cloud_sync.delete_confirm_body')}\n\n${I18n.t('shared_ledgers.delete_account_note')}`
        : I18n.t('cloud_sync.delete_confirm_body'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('cloud_sync.delete_confirm_cta'),
          style: 'destructive',
          onPress: () => run('delete', sync.deleteAccount),
        },
      ],
    );

  return (
    <Card className="px-4 py-0">
      <ActionRow
        icon={
          busy === 'sign_out' ? (
            <LoadingDots size={5} color={colors.textSoft} />
          ) : (
            <LogOut size={20} color={colors.textSoft} />
          )
        }
        label={I18n.t('cloud_sync.sign_out')}
        disabled={busy !== null}
        onPress={confirmSignOut}
      />
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      <ActionRow
        icon={
          busy === 'delete' ? (
            <LoadingDots size={5} color={colors.error} />
          ) : (
            <Trash2 size={20} color={colors.error} />
          )
        }
        label={I18n.t('cloud_sync.delete_account')}
        color={colors.error}
        disabled={busy !== null}
        onPress={confirmDelete}
      />
    </Card>
  );
}

function ActionRow({
  icon,
  label,
  color,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, disabled && styles.dimmed]}
    >
      {icon}
      <Text variant="body" className="flex-1" style={color ? { color } : undefined}>
        {label}
      </Text>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  dimmed: { opacity: 0.6 },
});
