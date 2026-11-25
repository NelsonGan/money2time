import { Check, X } from 'lucide-react-native';
import React from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { spacing } from '~/constants/designSystem';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';

interface LogoCountryPickerModalProps {
  visible: boolean;
  onClose: () => void;
  countries: readonly { slug: string; name: string }[];
  activeCountry: string;
  getFlag: (slug: string) => string;
  onSelect: (slug: string) => void;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '70%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
});

/**
 * The country list behind a logo catalog: the logo pickers and onboarding's
 * accounts step browse a country's banks and wallets through it.
 */
export function LogoCountryPickerModal({
  visible,
  onClose,
  countries,
  activeCountry,
  getFlag,
  onSelect,
}: LogoCountryPickerModalProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sheetColumnStyle = useSheetColumnStyle();

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Neither wrapper is an accessibility element, or VoiceOver reads the
          whole list as one and its rows cannot be chosen. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, sheetColumnStyle]}
          accessible={false}
        >
          <View
            className="bg-card rounded-t-[28px] flex-1"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="px-5 pt-5 pb-3 flex-row items-center">
              <Text variant="subheading" className="flex-1">
                {I18n.t('accounts.logo.country')}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                hitSlop={8}
                className="h-9 w-9 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
              >
                <X size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>
            <FlatList
              data={countries}
              keyExtractor={(c) => c.slug}
              className="flex-1"
              contentContainerStyle={{ paddingBottom: spacing.md }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: country }) => {
                const isActive = country.slug === activeCountry;
                return (
                  <Pressable
                    onPress={() => onSelect(country.slug)}
                    style={styles.row}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text className="text-[20px]">{getFlag(country.slug)}</Text>
                    <Text
                      variant="body"
                      numberOfLines={1}
                      className={cn('flex-1', isActive && 'text-primary font-medium')}
                    >
                      {country.name}
                    </Text>
                    {isActive ? <Check size={18} color={themeColors.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
