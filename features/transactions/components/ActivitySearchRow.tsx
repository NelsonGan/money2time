import { Search, X } from 'lucide-react-native';
import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { spacing } from '~/constants/designSystem';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

interface ActivitySearchRowProps {
  inputRef: React.RefObject<TextInput | null>;
  visible: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onClose: () => void;
}

export function ActivitySearchRow({
  inputRef,
  visible,
  value,
  onChangeText,
  onClose,
}: ActivitySearchRowProps) {
  const themeColors = useThemeColors();
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    focusTimeoutRef.current = setTimeout(() => {
      inputRef.current?.focus();
    }, 40);

    return () => {
      if (focusTimeoutRef.current !== null) {
        clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    };
  }, [inputRef, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.inputShell,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.border,
          },
        ]}
      >
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={I18n.t('transactions.filters.search_placeholder')}
          placeholderTextColor={themeColors.textMuted}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={[SINGLE_LINE_TEXT_INPUT_STYLE, styles.input, { color: themeColors.text }]}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.close')}
        onPress={onClose}
        style={[
          styles.closeButton,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.border,
          },
        ]}
      >
        <X size={14} color={themeColors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 54,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    fontWeight: '500',
  },
  closeButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
