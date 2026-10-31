import { Check, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

import { Button, FatButton, Text } from '~/components/ui';
import { LedgerSheetFrame } from '~/features/ledgers/components/LedgerSheetFrame';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { BackupRestoreOptions } from '~/services/dataManagementService';
import type { RestoreLedgerChoice } from '~/utils/backupLedgerPolicy';

interface Props {
  busy: boolean;
  exportedAt: string;
  choices: RestoreLedgerChoice[];
  onRestore: (options: BackupRestoreOptions) => void;
  onCancel: () => void;
}

export function BackupRestoreSheet({ busy, exportedAt, choices, onRestore, onCancel }: Props) {
  const colors = useThemeColors();
  const [personal, setPersonal] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const parsed = new Date(exportedAt);
  const date = Number.isNaN(parsed.getTime()) ? exportedAt : parsed.toLocaleString();
  const confirm = () => {
    const options = { restorePersonal: personal, sharedLedgerIds: selected };
    if (!selected.length) {
      onRestore(options);
      return;
    }
    Alert.alert(
      I18n.t('backup_restore.confirm_title'),
      I18n.t('backup_restore.confirm_message', {
        names: choices
          .filter((choice) => selected.includes(choice.ledgerId))
          .map((choice) => choice.name)
          .join(', '),
        date,
      }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('auto_backup.restore_confirm_action'),
          style: 'destructive',
          onPress: () => onRestore(options),
        },
      ],
    );
  };
  const check = (checked: boolean) => (
    <View className="h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
      {checked ? <Check size={18} color={colors.primary} /> : null}
    </View>
  );
  return (
    <LedgerSheetFrame
      visible
      onClose={busy ? () => {} : onCancel}
      header={
        <View className="gap-2 px-5 pb-4 pt-3">
          <Text variant="subheading">{I18n.t('backup_restore.title')}</Text>
          <Text variant="caption" tone="muted">
            {date}
          </Text>
          <Text variant="caption" tone="muted">
            {I18n.t('backup_restore.description')}
          </Text>
        </View>
      }
    >
      {busy ? (
        <View className="items-center gap-4 py-8">
          <ActivityIndicator color={colors.primary} size="large" />
          <Text>{I18n.t('auto_backup.restoring')}</Text>
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: personal }}
            accessibilityLabel={I18n.t('backup_restore.personal')}
            testID="restore-personal"
            onPress={() => setPersonal(!personal)}
            className="flex-row items-center gap-3 rounded-3xl border border-border/50 bg-background p-4"
          >
            <View className="flex-1 gap-1">
              <Text variant="bodyStrong">{I18n.t('backup_restore.personal')}</Text>
              <Text variant="caption" tone="muted">
                {I18n.t('backup_restore.personal_note')}
              </Text>
            </View>
            {check(personal)}
          </Pressable>
          {choices.map((choice) => {
            const checked = selected.includes(choice.ledgerId);
            return (
              <Pressable
                key={choice.ledgerId}
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled: !choice.canRestore }}
                accessibilityLabel={`${choice.name}, ${I18n.t(choice.canRestore ? 'backup_restore.owned' : 'backup_restore.unavailable')}`}
                testID={`restore-ledger-${choice.ledgerId}`}
                disabled={!choice.canRestore}
                onPress={() =>
                  setSelected(
                    checked
                      ? selected.filter((id) => id !== choice.ledgerId)
                      : [...selected, choice.ledgerId],
                  )
                }
                className="flex-row items-center gap-3 rounded-3xl border border-border/50 bg-background p-4"
              >
                <Users size={20} color={colors.primary} />
                <View className="flex-1 gap-1">
                  <Text variant="bodyStrong">{choice.name}</Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t(
                      choice.canRestore ? 'backup_restore.owned' : 'backup_restore.unavailable',
                    )}
                  </Text>
                </View>
                {check(checked)}
              </Pressable>
            );
          })}
          <View className="gap-3 py-3">
            <Text variant="caption" tone="muted">
              {I18n.t('backup_restore.members_note')}
            </Text>
            <Text variant="caption" tone="muted">
              {I18n.t('backup_restore.safety_note')}
            </Text>
          </View>
          <FatButton
            label={I18n.t('auto_backup.restore_action')}
            disabled={!personal && !selected.length}
            onPress={confirm}
            testID="restore-confirm"
          />
          <Button variant="ghost" onPress={onCancel}>
            <Text>{I18n.t('common.cancel')}</Text>
          </Button>
        </>
      )}
    </LedgerSheetFrame>
  );
}
