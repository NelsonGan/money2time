import { Lock, Plus, Trash2, Users } from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  Button,
  CategoryEmoji,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { useCloudSync, useCloudSyncEnabled } from '~/features/cloudSync/CloudSyncContext';
import { useLedgerLock, useSharedLedgers } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import { sharingErrorMessage } from '~/features/sharedLedgers/lib/sharing';
import { useThemeColors } from '~/hooks/useThemeColors';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Ledger } from '~/types';
import { cn } from '~/utils';

import { ProChip } from '../components/ProChip';
import { ledgerDisplayName, ledgerIcon, ledgerSummary } from '../lib/ledgerDisplay';

interface LedgersScreenProps {
  onBack: () => void;
  onEditLedger: (ledgerId: string) => void;
  onCreateLedger: () => void;
  onOpenSharing: (ledgerId: string) => void;
  onOpenProPaywall: (source: string) => void;
}

/** Every ledger: rename or re-icon one, delete one, or add one. */
export function LedgersScreen({
  onBack,
  onEditLedger,
  onCreateLedger,
  onOpenSharing,
  onOpenProPaywall,
}: LedgersScreenProps) {
  const { ledgers, activeLedger, deleteLedger, getLedgerEntryCounts } = useApp();
  const isPro = useIsPro();
  const sync = useCloudSync();
  const sharingEnabled = useCloudSyncEnabled();
  const sharedLedgers = useSharedLedgers();
  const lockOf = useLedgerLock();
  const themeColors = useThemeColors();
  const bottomInset = useSettingsBottomNavInset();
  // Read once per visit: nothing on this page adds or removes entries.
  const [entryCounts] = useState(getLedgerEntryCounts);

  const confirmDelete = (ledger: Ledger) => {
    void triggerHaptic('warning');
    const name = ledgerDisplayName(ledger);
    const count = entryCounts[ledger.id] ?? 0;
    const sharedByMe = sharedLedgers.some((l) => l.ledgerId === ledger.id && l.role === 'owner');
    const message = I18n.t(
      count === 1 ? 'ledgers.delete_message_one' : 'ledgers.delete_message_other',
      { name, count },
    );
    Alert.alert(
      I18n.t('ledgers.delete_title', { name }),
      sharedByMe ? `${message}\n\n${I18n.t('shared_ledgers.delete_shared_note')}` : message,
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                // Members lose it first, so nobody keeps syncing a deleted ledger.
                // Signed out, offline, or after the account was deleted, it is
                // still deleted here; the Worker is told at the next sign-in.
                if (sharedByMe) {
                  await sync.stopSharingLedger(ledger.id, { whenUnreachable: 'local' });
                }
                void triggerHaptic('success');
                deleteLedger(ledger.id);
              } catch (error) {
                Alert.alert(sharingErrorMessage(error));
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title={I18n.t('ledgers.manage')}
        infoTooltip={
          !isPro && ledgers.length > 1
            ? `${I18n.t('ledgers.explainer')}\n\n${I18n.t('ledgers.locked_note')}`
            : I18n.t('ledgers.explainer')
        }
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={[{ paddingHorizontal: 20, gap: 8 }, bottomInset]}
        showsVerticalScrollIndicator={false}
      >
        {ledgers.map((ledger) => {
          const isOpen = ledger.id === activeLedger.id;
          const locked = lockOf(ledger.id) !== null;
          const count = entryCounts[ledger.id] ?? 0;
          const shared = sharedLedgers.find((l) => l.ledgerId === ledger.id) ?? null;
          const isMember = shared?.role === 'member';
          // A member leaves from the ledger's sharing page instead.
          const canDelete = ledger.id !== DEFAULT_LEDGER_ID && !isOpen && !isMember;
          const summary = shared
            ? `${
                isMember
                  ? I18n.t('shared_ledgers.status_shared_by', { name: shared.ownerName ?? '' })
                  : I18n.t('shared_ledgers.status_shared')
              } · ${ledgerSummary(ledger, count)}`
            : ledgerSummary(ledger, count);
          return (
            <View
              key={ledger.id}
              className={cn(
                'flex-row items-center rounded-3xl border',
                isOpen ? 'border-primary/30 bg-primary/10' : 'border-border/30 bg-card',
              )}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${I18n.t('ledgers.edit_named', {
                  name: ledgerDisplayName(ledger),
                })}, ${summary}${locked ? `, ${I18n.t('ledgers.locked_note')}` : ''}`}
                testID={`ledger-edit-${ledger.id}`}
                onPress={() => {
                  void triggerHaptic('selection');
                  onEditLedger(ledger.id);
                }}
                className="min-w-0 flex-1 flex-row items-center gap-3 px-3 py-3 active:opacity-80"
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-secondary/60">
                  <CategoryEmoji icon={ledgerIcon(ledger)} size={26} />
                </View>
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text variant="bodyStrong" numberOfLines={1} className="shrink">
                      {ledgerDisplayName(ledger)}
                    </Text>
                    {isOpen ? (
                      <Text variant="label" tone="primary">
                        {I18n.t('ledgers.open_badge')}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {summary}
                  </Text>
                </View>
                {locked ? <Lock size={16} color={themeColors.textMuted} /> : null}
              </Pressable>
              {sharingEnabled && ledger.id !== DEFAULT_LEDGER_ID && (shared || isPro) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('shared_ledgers.title')}
                  testID={`ledger-sharing-${ledger.id}`}
                  onPress={() => {
                    void triggerHaptic('selection');
                    onOpenSharing(ledger.id);
                  }}
                  hitSlop={6}
                  className="h-10 w-10 items-center justify-center rounded-full active:bg-secondary/60"
                >
                  <Users size={18} color={shared ? themeColors.primary : themeColors.textMuted} />
                </Pressable>
              ) : null}
              {canDelete ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('ledgers.delete_title', {
                    name: ledgerDisplayName(ledger),
                  })}
                  testID={`ledger-delete-${ledger.id}`}
                  onPress={() => confirmDelete(ledger)}
                  hitSlop={6}
                  className="mr-2 h-10 w-10 items-center justify-center rounded-full active:bg-secondary/60"
                >
                  <Trash2 size={18} color={themeColors.error} />
                </Pressable>
              ) : null}
            </View>
          );
        })}

        <Button
          variant="secondary"
          className="mt-3"
          testID="ledgers-add"
          onPress={() => {
            if (isPro) onCreateLedger();
            else onOpenProPaywall('ledgers_create');
          }}
        >
          <View className="flex-row items-center gap-2">
            <Plus size={18} color={themeColors.primary} />
            <Text>{I18n.t('ledgers.new')}</Text>
            {!isPro ? <ProChip /> : null}
          </View>
        </Button>
      </ScrollView>
    </SettingsPageLayout>
  );
}
