import { ChevronRight, Lock, Plus, Trash2 } from 'lucide-react-native';
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
import { useThemeColors } from '~/hooks/useThemeColors';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Ledger } from '~/types';
import { cn } from '~/utils';

import { ProChip } from '../components/ProChip';
import { ledgerDisplayName, ledgerIcon, ledgerNeedsPro } from '../lib/ledgerDisplay';

interface LedgersScreenProps {
  onBack: () => void;
  onEditLedger: (ledgerId: string) => void;
  onCreateLedger: () => void;
  onOpenProPaywall: (source: string) => void;
}

/** Every ledger: rename or re-icon one, delete one, or add one. */
export function LedgersScreen({
  onBack,
  onEditLedger,
  onCreateLedger,
  onOpenProPaywall,
}: LedgersScreenProps) {
  const { ledgers, activeLedger, deleteLedger, getLedgerEntryCounts } = useApp();
  const isPro = useIsPro();
  const themeColors = useThemeColors();
  const bottomInset = useSettingsBottomNavInset();
  // Read once per visit: nothing on this page adds or removes entries.
  const [entryCounts] = useState(getLedgerEntryCounts);

  const confirmDelete = (ledger: Ledger) => {
    void triggerHaptic('warning');
    const name = ledgerDisplayName(ledger);
    const count = entryCounts[ledger.id] ?? 0;
    Alert.alert(
      I18n.t('ledgers.delete_title', { name }),
      I18n.t(count === 1 ? 'ledgers.delete_message_one' : 'ledgers.delete_message_other', {
        name,
        count,
      }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void triggerHaptic('success');
            deleteLedger(ledger.id);
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
          const locked = ledgerNeedsPro(ledger.id) && !isPro;
          const count = entryCounts[ledger.id] ?? 0;
          const canDelete = ledger.id !== DEFAULT_LEDGER_ID && !isOpen;
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
                accessibilityLabel={I18n.t('ledgers.edit_named', {
                  name: ledgerDisplayName(ledger),
                })}
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
                    {[
                      ledger.currencyCode,
                      I18n.t(count === 1 ? 'ledgers.entries_one' : 'ledgers.entries_other', {
                        count,
                      }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                {locked ? <Lock size={16} color={themeColors.textMuted} /> : null}
                <ChevronRight size={18} color={themeColors.textMuted} />
              </Pressable>
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
