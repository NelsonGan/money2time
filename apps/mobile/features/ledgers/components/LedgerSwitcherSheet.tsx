import { Check, Lock, Plus } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryEmoji, InfoTooltipButton, Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useApp } from '~/context/AppContext';
import { useIsPro } from '~/context/ProContext';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import {
  ledgerAccessibilityLabel,
  ledgerDisplayName,
  ledgerIcon,
  ledgerNeedsPro,
  ledgerSummary,
} from '../lib/ledgerDisplay';
import { ProChip } from './ProChip';

interface LedgerSwitcherSheetProps {
  visible: boolean;
  /** Live entries per ledger id, read when the sheet was opened. */
  entryCounts: Readonly<Record<string, number>>;
  onClose: () => void;
  /** Opens the paywall; `source` is the paywall funnel's attribution. */
  onOpenProPaywall: (source: string) => void;
  onCreateLedger: () => void;
  onManageLedgers: () => void;
}

/**
 * Every ledger, with the open one ticked. Picking another opens it at once;
 * without Pro only the default ledger opens, and the others (kept since Pro
 * ended) show a lock that leads to the paywall.
 */
export function LedgerSwitcherSheet({
  visible,
  entryCounts,
  onClose,
  onOpenProPaywall,
  onCreateLedger,
  onManageLedgers,
}: LedgerSwitcherSheetProps) {
  const { ledgers, activeLedger, switchLedger } = useApp();
  const isPro = useIsPro();
  const themeColors = useThemeColors();
  const sheetColumnStyle = useSheetColumnStyle();
  const insets = useSafeAreaInsets();

  const handlePick = (ledgerId: string) => {
    if (ledgerId === activeLedger.id) {
      onClose();
      return;
    }
    if (ledgerNeedsPro(ledgerId) && !isPro) {
      void triggerHaptic('selection');
      onClose();
      onOpenProPaywall('ledgers_switch');
      return;
    }
    void triggerHaptic('success');
    onClose();
    switchLedger(ledgerId);
  };

  const handleCreate = () => {
    void triggerHaptic('selection');
    onClose();
    if (isPro) onCreateLedger();
    else onOpenProPaywall('ledgers_create');
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.sheet, sheetColumnStyle]}
        >
          <View className="rounded-t-[28px] bg-card">
            <View className="items-center pt-2.5">
              <View className="h-1 w-10 rounded-full bg-border/60" />
            </View>
            <View className="flex-row items-center gap-2 px-5 pb-3 pt-3">
              <Text variant="subheading">{I18n.t('ledgers.title')}</Text>
              <InfoTooltipButton
                title={I18n.t('ledgers.title')}
                infoTooltip={I18n.t('ledgers.explainer')}
              />
            </View>
            <ScrollView
              style={styles.list}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
                gap: 8,
              }}
              showsVerticalScrollIndicator={false}
            >
              {ledgers.map((ledger) => {
                const isOpen = ledger.id === activeLedger.id;
                const locked = ledgerNeedsPro(ledger.id) && !isPro;
                const count = entryCounts[ledger.id] ?? 0;
                return (
                  <Pressable
                    key={ledger.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isOpen }}
                    accessibilityLabel={ledgerAccessibilityLabel(ledger, count, locked)}
                    testID={`ledger-row-${ledger.id}`}
                    onPress={() => handlePick(ledger.id)}
                    className={cn(
                      'flex-row items-center gap-3 rounded-3xl border px-3 py-3 active:opacity-80',
                      isOpen ? 'border-primary/30 bg-primary/10' : 'border-border/30 bg-background',
                    )}
                  >
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-secondary/60">
                      <CategoryEmoji icon={ledgerIcon(ledger)} size={26} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {ledgerDisplayName(ledger)}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {ledgerSummary(ledger, count)}
                      </Text>
                    </View>
                    {isOpen ? (
                      <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
                        <Check size={16} color="#fff" strokeWidth={3} />
                      </View>
                    ) : locked ? (
                      <View className="flex-row items-center gap-2">
                        <Lock size={16} color={themeColors.textMuted} />
                        <ProChip />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}

              <Pressable
                accessibilityRole="button"
                testID="ledger-new"
                onPress={handleCreate}
                className="flex-row items-center gap-3 rounded-3xl border border-dashed border-primary/40 px-3 py-3 active:opacity-80"
              >
                <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Plus size={22} color={themeColors.primary} />
                </View>
                <Text variant="bodyStrong" tone="primary" className="flex-1">
                  {I18n.t('ledgers.new')}
                </Text>
                {!isPro ? <ProChip /> : null}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                testID="ledger-manage"
                onPress={() => {
                  void triggerHaptic('selection');
                  onClose();
                  onManageLedgers();
                }}
                hitSlop={8}
                className="items-center py-3 active:opacity-70"
              >
                <Text variant="bodyStrong" tone="primary">
                  {I18n.t('ledgers.manage')}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '85%',
  },
  list: {
    flexGrow: 0,
  },
});
