import { Check, Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { ALL_CURRENCIES } from '~/constants/appDefaults';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { isAutoRateSupported } from '~/utils/currency';

interface CurrencyPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
  selectedCode?: string | null;
  /** Codes to hide (e.g. already-added currencies, the reporting currency). */
  excludeCodes?: string[];
  /** When set, show only these codes (e.g. the account-currency picker). */
  restrictToCodes?: string[];
  /** Footer action rendered below the list (e.g. "Add subcurrency"). */
  footer?: React.ReactNode;
  title?: string;
}

interface CurrencySection {
  title: string;
  data: { code: string; symbol: string; name: string }[];
}

export function CurrencyPickerSheet({
  visible,
  onClose,
  onSelect,
  selectedCode,
  excludeCodes,
  restrictToCodes,
  footer,
  title,
}: CurrencyPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const excludeSet = useMemo(() => new Set(excludeCodes ?? []), [excludeCodes]);
  const restrictSet = useMemo(
    () => (restrictToCodes ? new Set(restrictToCodes) : null),
    [restrictToCodes],
  );

  const sections = useMemo<CurrencySection[]>(() => {
    const q = query.trim().toLowerCase();
    const matches = ALL_CURRENCIES.filter((c) => {
      if (excludeSet.has(c.code)) return false;
      // Restrict to an explicit set (account picker) or, by default, to the
      // currencies the auto-conversion feed supports.
      if (restrictSet ? !restrictSet.has(c.code) : !isAutoRateSupported(c.code)) return false;
      if (!q) return true;
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    }).sort((a, b) => a.code.localeCompare(b.code));

    const buckets = new Map<string, CurrencySection['data']>();
    for (const c of matches) {
      const letter = c.code[0]?.toUpperCase() ?? '#';
      const list = buckets.get(letter) ?? [];
      list.push(c);
      buckets.set(letter, list);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([letter, data]) => ({ title: letter, data }));
  }, [excludeSet, query, restrictSet]);

  const handleSelect = (code: string) => {
    void triggerHaptic('selection');
    onSelect(code);
    setQuery('');
    onClose();
  };

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View
            className="bg-card rounded-t-[28px] flex-1"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="px-5 pt-5 pb-3 flex-row items-center gap-2">
              <Text variant="subheading" numberOfLines={1} className="shrink">
                {title ?? I18n.t('exchange_rates.choose_currency')}
              </Text>
              <View className="flex-1" />
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                hitSlop={8}
                className="h-9 w-9 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
              >
                <X size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>

            <View className="px-5 pb-3">
              <View
                className="flex-row items-center gap-2 rounded-2xl bg-secondary/60 px-3"
                style={{ height: 44 }}
              >
                <Search size={16} color={themeColors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={I18n.t('exchange_rates.search_currency')}
                  placeholderTextColor={themeColors.textMuted}
                  autoCorrect={false}
                  autoCapitalize="characters"
                  allowFontScaling={false}
                  style={{ flex: 1, color: themeColors.text, fontSize: 16 }}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <X size={16} color={themeColors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <SectionList
              sections={sections}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => (
                <Text variant="caption" tone="muted" className="mt-3 mb-1 px-1 uppercase">
                  {section.title}
                </Text>
              )}
              renderItem={({ item }) => {
                const isSelected = item.code === selectedCode;
                return (
                  <Pressable
                    onPress={() => handleSelect(item.code)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    className={cn(
                      'flex-row items-center gap-3 rounded-2xl px-3 py-3 mb-1',
                      isSelected ? 'bg-primary/15 border border-primary/30' : 'bg-secondary/40',
                    )}
                  >
                    <View className="w-11 items-center">
                      <Text variant="bodyStrong">{item.symbol}</Text>
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text variant="body" numberOfLines={1}>
                        {item.code}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    {isSelected ? <Check size={18} color={themeColors.primary} /> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text variant="body" tone="muted" className="px-1 py-6 text-center">
                  {I18n.t('exchange_rates.no_currency_match')}
                </Text>
              }
              ListFooterComponent={footer ? <View className="mt-2">{footer}</View> : null}
            />
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
    height: '80%',
  },
});
