import { X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryGrid, type CategoryPickerOption } from '~/components/ui/CategoryGrid';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export type { CategoryPickerOption } from '~/components/ui/CategoryGrid';

interface CategoryPickerSheetBaseProps {
  visible: boolean;
  onClose: () => void;
  parents: CategoryPickerOption[];
  childByParent: Map<string, CategoryPickerOption[]>;
  allowParentSelection?: boolean;
  /** Render as an absolute-fill View instead of a native Modal (for use inside another modal). */
  overlay?: boolean;
}

interface CategoryPickerSheetSingleProps extends CategoryPickerSheetBaseProps {
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
  selectedCategoryIds?: never;
  onToggleSelect?: never;
}

interface CategoryPickerSheetMultiProps extends CategoryPickerSheetBaseProps {
  selectedCategoryIds: string[];
  onToggleSelect: (categoryId: string) => void;
  /** Optional handler — when provided, renders a "Clear" button in the header while there are selections. */
  onClear?: () => void;
  selectedCategoryId?: never;
  onSelect?: never;
}

export type CategoryPickerSheetProps =
  | CategoryPickerSheetSingleProps
  | CategoryPickerSheetMultiProps;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '75%',
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
  gridContent: {
    paddingBottom: 8,
  },
});

export function CategoryPickerSheet(props: CategoryPickerSheetProps) {
  const {
    visible,
    onClose,
    parents,
    childByParent,
    allowParentSelection = false,
    overlay = false,
  } = props;
  const isMultiSelect = 'selectedCategoryIds' in props && props.selectedCategoryIds !== undefined;
  const selectionCount = isMultiSelect
    ? props.selectedCategoryIds.length
    : props.selectedCategoryId
      ? 1
      : 0;

  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const grid = isMultiSelect ? (
    <CategoryGrid
      className="flex-1 px-4"
      contentContainerStyle={styles.gridContent}
      parents={parents}
      childByParent={childByParent}
      allowParentSelection={allowParentSelection}
      selectedCategoryIds={props.selectedCategoryIds}
      onToggleSelect={props.onToggleSelect}
    />
  ) : (
    <CategoryGrid
      className="flex-1 px-4"
      contentContainerStyle={styles.gridContent}
      parents={parents}
      childByParent={childByParent}
      allowParentSelection={allowParentSelection}
      selectedCategoryId={props.selectedCategoryId}
      onSelect={props.onSelect}
    />
  );

  const sheetContent = (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
        <View
          className="bg-card rounded-t-[28px] flex-1"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="px-5 pt-5 pb-5 flex-row items-center gap-2">
            <Text variant="subheading" numberOfLines={1} className="shrink">
              {I18n.t('categories.title')}
            </Text>
            {isMultiSelect && props.onClear && selectionCount > 0 ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  props.onClear!();
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.clear')}
                className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 active:opacity-85"
              >
                <Text variant="caption" className="text-primary font-medium">
                  {I18n.t('common.clear')}
                </Text>
              </Pressable>
            ) : null}
            <View className="flex-1" />
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
          {grid}
        </View>
      </Pressable>
    </Pressable>
  );

  if (overlay) {
    if (!visible) return null;
    return <View style={styles.absoluteFill}>{sheetContent}</View>;
  }

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {sheetContent}
    </ThemeModal>
  );
}
