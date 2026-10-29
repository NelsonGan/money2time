import { Check, Users } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useSharedLedgers } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { ledgerDisplayName, ledgerIcon, ledgerSummary } from '../lib/ledgerDisplay';
import { LedgerSheetFrame } from './LedgerSheetFrame';

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

  return (
    <LedgerSheetFrame
      visible={visible}
      onClose={onClose}
      header={
        <Text variant="subheading" className="px-5 pb-3 pt-3">
          {title}
        </Text>
      }
    >
      {ledgers.map((ledger) => {
        const selected = ledger.id === selectedId;
        const shared = sharedLedgers.some((l) => l.ledgerId === ledger.id);
        return (
          <Pressable
            key={ledger.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${ledgerDisplayName(ledger)}, ${ledgerSummary(ledger, entryCounts[ledger.id] ?? 0)}`}
            testID={`ledger-pick-${ledger.id}`}
            onPress={() => {
              void triggerHaptic('selection');
              onSelect(ledger.id);
              onClose();
            }}
            className={cn(
              'flex-row items-center gap-3 rounded-3xl border px-3 py-3 active:opacity-80',
              selected ? 'border-primary/30 bg-primary/10' : 'border-border/30 bg-background',
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
    </LedgerSheetFrame>
  );
}
