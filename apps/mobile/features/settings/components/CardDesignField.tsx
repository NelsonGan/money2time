import { ChevronRight, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { getCardDesignTemplate, isCustomCardDesign } from '~/constants/cardDesigns';
import { useResolvedTheme } from '~/context/ThemeContext';
import {
  CardDesignBackground,
  useCardDesignAppearance,
} from '~/features/settings/components/AccountCardDesign';
import { getPlainCardColors } from '~/features/settings/components/AccountCardStack';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { AccountType } from '~/types';

const THUMB_WIDTH = 56;
const THUMB_HEIGHT = 35;

interface CardDesignFieldProps {
  value: string | null;
  accountType: AccountType;
  /** The account's place in its stack section, for its plain colour. */
  stackIndex: number;
  /** Left out of totals: its plain card is the grey excluded one. */
  includeInTotals: boolean;
  onOpen: () => void;
  onClear: () => void;
}

/** The account editor's "Card design" row: a thumbnail of the card and its name. */
export function CardDesignField({
  value,
  accountType,
  stackIndex,
  includeInTotals,
  onOpen,
  onClear,
}: CardDesignFieldProps) {
  const themeColors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';
  const appearance = useCardDesignAppearance(value);
  const template = getCardDesignTemplate(value);
  const plain = getPlainCardColors(accountType, isDark, stackIndex, includeInTotals);

  const label = !appearance
    ? I18n.t('accounts.card_design.plain')
    : template
      ? I18n.t(`accounts.card_design.genre_${template.genre}`)
      : isCustomCardDesign(value)
        ? I18n.t('accounts.card_design.my_uploads')
        : I18n.t('accounts.card_design.plain');

  return (
    <View>
      <Text variant="label" tone="muted" className="mb-2">
        {I18n.t('accounts.card_design.label')}
      </Text>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onOpen();
        }}
        className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={I18n.t('accounts.card_design.label')}
        accessibilityValue={{ text: label }}
        // VoiceOver reads the row as one element, so the inline clear button
        // is offered as an action on it too.
        accessibilityActions={
          appearance ? [{ name: 'clear', label: I18n.t('accounts.card_design.clear') }] : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'clear') onClear();
        }}
      >
        <View
          style={[
            styles.thumb,
            { backgroundColor: plain.bg, borderColor: appearance ? 'transparent' : plain.border },
          ]}
        >
          {appearance ? (
            <CardDesignBackground value={value} appearance={appearance} variant="thumb" />
          ) : null}
        </View>
        <Text
          variant="body"
          tone={appearance ? undefined : 'muted'}
          numberOfLines={1}
          className="flex-1"
        >
          {label}
        </Text>
        {appearance ? (
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onClear();
            }}
            hitSlop={10}
            className="h-7 w-7 items-center justify-center rounded-full bg-secondary/70"
            accessibilityRole="button"
            accessibilityLabel={I18n.t('accounts.card_design.clear')}
          >
            <X size={14} color={themeColors.textMuted} />
          </Pressable>
        ) : (
          <ChevronRight size={16} color={themeColors.textMuted} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: 7,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
