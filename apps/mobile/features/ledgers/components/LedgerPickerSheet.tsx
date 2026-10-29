import { Check, Users } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryEmoji, Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useApp } from '~/context/AppContext';
import { useSharedLedgers } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { ledgerDisplayName, ledgerIcon, ledgerSummary } from '../lib/ledgerDisplay';

interface LedgerPickerSheetProps {
  visible: boolean;
  title: string;
  selectedId: string;
  /** Live entries per ledger id. */
  entryCounts: Readonly<Record<string, number>>;
  onSelect: (ledgerId: string) => void;
  onClose: () => void;
}

/** Pick one of the phone's ledgers, e.g. the one a new ledger copies from. */
export function LedgerPickerSheet({
  visible,
  title,
  selectedId,
  entryCounts,
  onSelect,
  onClose,
}: LedgerPickerSheetProps) {
  const { ledgers } = useApp();
  const sharedLedgers = useSharedLedgers();
  const themeColors = useThemeColors();
  const sheetColumnStyle = useSheetColumnStyle();
  const insets = useSafeAreaInsets();

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
            <Text variant="subheading" className="px-5 pb-3 pt-3">
              {title}
            </Text>
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
                const selected = ledger.id === selectedId;
                const shared = sharedLedgers.some((l) => l.ledgerId === ledger.id);
                return (
                  <Pressable
                    key={ledger.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={ledgerDisplayName(ledger)}
                    testID={`ledger-pick-${ledger.id}`}
                    onPress={() => {
                      void triggerHaptic('selection');
                      onSelect(ledger.id);
                      onClose();
                    }}
                    className={cn(
                      'flex-row items-center gap-3 rounded-3xl border px-3 py-3 active:opacity-80',
                      selected
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-border/30 bg-background',
                    )}
                  >
                    <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary/60">
                      <CategoryEmoji icon={ledgerIcon(ledger)} size={24} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text variant="bodyStrong" numberOfLines={1} className="shrink">
                          {ledgerDisplayName(ledger)}
                        </Text>
                        {shared ? <Users size={14} color={themeColors.primary} /> : null}
                      </View>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {ledgerSummary(ledger, entryCounts[ledger.id] ?? 0)}
                      </Text>
                    </View>
                    {selected ? (
                      <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
                        <Check size={16} color="#fff" strokeWidth={3} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%' },
  list: { flexGrow: 0 },
});
