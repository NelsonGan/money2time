import { Banknote, ChartPie, Check, Diff, type LucideIcon, Percent } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { BottomSheetModal } from '~/components/ui/bottom-sheet-modal';
import { SPLIT_METHODS, type SplitMethod } from '~/features/transactions/lib/splitMethods';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const METHOD_ICONS: Record<SplitMethod, LucideIcon> = {
  amount: Banknote,
  percent: Percent,
  shares: ChartPie,
  adjust: Diff,
};

/** A split method's name, as the Split by row and this sheet show it. */
export function splitMethodLabel(method: SplitMethod): string {
  return I18n.t(`transactions.editor.split.method_${method}`);
}

interface SplitMethodSheetProps {
  visible: boolean;
  method: SplitMethod;
  onClose: () => void;
  onSelect: (method: SplitMethod) => void;
}

/**
 * How the bill is divided: by amount (the default), percentage, shares, or
 * evenly with adjustments. Each option says in one line what it does, so the
 * page itself needs no explanation. Picking one closes the sheet.
 */
export function SplitMethodSheet({ visible, method, onClose, onSelect }: SplitMethodSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="70%"
      style={{ paddingBottom: Math.max(insets.bottom, 16) + 4 }}
    >
      <View className="items-center pt-2.5">
        <View className="h-1 w-10 rounded-full bg-border/60" />
      </View>
      <Text variant="subheading" className="px-6 pb-2 pt-4 text-center">
        {I18n.t('transactions.editor.split.split_by_label')}
      </Text>
      {SPLIT_METHODS.map((option, index) => {
        const Icon = METHOD_ICONS[option];
        const selected = option === method;
        return (
          <Pressable
            key={option}
            onPress={() => {
              void triggerHaptic('selection');
              onSelect(option);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            testID={`split-method-${option}`}
            className={
              index > 0
                ? 'mx-4 flex-row items-center gap-3 border-t border-border/15 px-2 py-3 active:opacity-70'
                : 'mx-4 flex-row items-center gap-3 px-2 py-3 active:opacity-70'
            }
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <Icon size={18} color={themeColors.primary} />
            </View>
            <View className="flex-1">
              <Text variant="bodyStrong">{splitMethodLabel(option)}</Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t(`transactions.editor.split.method_${option}_hint`)}
              </Text>
            </View>
            {selected ? <Check size={18} color={themeColors.primary} /> : null}
          </Pressable>
        );
      })}
    </BottomSheetModal>
  );
}
