import { ArrowLeftRight, Gift } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, ThemeModal } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export type DepositSource = 'transfer' | 'income';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
});

/**
 * Asks where deposited money comes from: another tracked account (a transfer)
 * or outside the app entirely (a gift / cash, recorded as income so cashflow
 * and savings-rate insights stay honest).
 */
export function DepositSourceSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (source: DepositSource) => void;
}) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const options: {
    source: DepositSource;
    icon: React.ReactNode;
    label: string;
    hint: string;
  }[] = [
    {
      source: 'transfer',
      icon: <ArrowLeftRight size={20} color={themeColors.primary} />,
      label: I18n.t('goals.deposit_from_account'),
      hint: I18n.t('goals.deposit_from_account_hint'),
    },
    {
      source: 'income',
      icon: <Gift size={20} color={themeColors.primary} />,
      label: I18n.t('goals.deposit_outside'),
      hint: I18n.t('goals.deposit_outside_hint'),
    },
  ];

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View
            className="rounded-t-[28px] bg-card px-5 pt-5"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          >
            <Text variant="subheading" className="pb-4">
              {I18n.t('goals.deposit')}
            </Text>
            <View className="gap-2.5">
              {options.map((option) => (
                <Pressable
                  key={option.source}
                  onPress={() => {
                    void triggerHaptic('selection');
                    onSelect(option.source);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  className="flex-row items-center gap-3.5 rounded-[22px] border border-border/30 bg-secondary/30 px-4 py-3.5 active:bg-secondary/60"
                >
                  <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                    {option.icon}
                  </View>
                  <View className="flex-1">
                    <Text variant="bodyStrong">{option.label}</Text>
                    <Text variant="caption" tone="muted" className="mt-0.5">
                      {option.hint}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
