import { FlashList } from '@shopify/flash-list';
import { Search, X } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Text } from '~/components/ui';
import {
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  useSettingsBottomNavInset,
} from '~/components/ui/settings';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { FONT } from '~/utils/fonts';

import { TutorialRow } from '../components/TutorialRow';
import {
  groupByCategory,
  searchTutorials,
  type Tutorial,
  tutorialCategoryKey,
} from '../content/tutorials';

interface TutorialsScreenProps {
  onBack: () => void;
  onOpenTutorial: (id: string) => void;
}

type Row =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'item'; id: string; tutorial: Tutorial };

export function TutorialsScreen({ onBack, onOpenTutorial }: TutorialsScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const inputRef = useRef<TextInput | null>(null);
  const [query, setQuery] = useState('');

  const rows = useMemo<Row[]>(() => {
    const sections = groupByCategory(searchTutorials(query));
    return sections.flatMap((section) => [
      {
        kind: 'header' as const,
        id: `header-${section.category}`,
        label: I18n.t(tutorialCategoryKey(section.category)),
      },
      ...section.tutorials.map((tutorial) => ({
        kind: 'item' as const,
        id: tutorial.id,
        tutorial,
      })),
    ]);
  }, [query]);

  const openTutorial = useCallback(
    (id: string) => {
      void triggerHaptic('selection');
      onOpenTutorial(id);
    },
    [onOpenTutorial],
  );

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'header') {
        return (
          <Text variant="caption" tone="muted" style={styles.sectionHeader}>
            {item.label.toUpperCase()}
          </Text>
        );
      }

      return <TutorialRow tutorial={item.tutorial} onPress={openTutorial} />;
    },
    [openTutorial],
  );

  return (
    <SettingsPageLayout edges={['top']}>
      <SettingsHeader title={I18n.t('tutorials.title')} onBack={onBack} />

      <View style={styles.searchRow}>
        <View
          style={[
            styles.inputShell,
            { backgroundColor: themeColors.card, borderColor: themeColors.border },
          ]}
        >
          <Search size={16} color={themeColors.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder={I18n.t('tutorials.search_placeholder')}
            placeholderTextColor={themeColors.textMuted}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            style={[SINGLE_LINE_TEXT_INPUT_STYLE, styles.input, { color: themeColors.text }]}
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.clear')}
              onPress={() => setQuery('')}
              hitSlop={8}
            >
              <X size={16} color={themeColors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {rows.length === 0 ? (
        <EmptyState
          mascotName="searching"
          title={I18n.t('tutorials.empty_title')}
          message={I18n.t('tutorials.empty_description')}
        />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(row) => row.id}
          renderItem={renderItem}
          // The nav bar floats over the list, so the last card has to clear it.
          contentContainerStyle={{ ...styles.listContent, ...bottomNavInset }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: spacing.sm,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    height: 50,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    fontFamily: FONT.medium,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
  },
  sectionHeader: {
    letterSpacing: 0.8,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
});
