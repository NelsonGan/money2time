import { Check, ChevronDown, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export interface CategoryPickerOption {
  id: string;
  name: string;
  icon: string;
}

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
  chevronCollapsed: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
});

const EMPTY_CHILDREN: CategoryPickerOption[] = [];

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
  const selectedCategorySet = useMemo(
    () =>
      new Set(
        isMultiSelect
          ? props.selectedCategoryIds
          : props.selectedCategoryId
            ? [props.selectedCategoryId]
            : [],
      ),
    [isMultiSelect, props.selectedCategoryId, props.selectedCategoryIds],
  );

  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);

  const handleSelection = (categoryId: string) => {
    void triggerHaptic('selection');
    if (isMultiSelect) {
      props.onToggleSelect!(categoryId);
    } else {
      props.onSelect!(categoryId);
    }
  };

  const ownerParentIdByCategoryId = useMemo(() => {
    const owners = new Map<string, string>();
    parents.forEach((parent) => {
      owners.set(parent.id, parent.id);
      const children = childByParent.get(parent.id) ?? EMPTY_CHILDREN;
      children.forEach((child) => owners.set(child.id, parent.id));
    });
    return owners;
  }, [childByParent, parents]);

  useEffect(() => {
    if (!visible) return;
    if (isMultiSelect) return;
    if (!props.selectedCategoryId) return;
    const ownerParentId = ownerParentIdByCategoryId.get(props.selectedCategoryId);
    if (ownerParentId) setExpandedParentId(ownerParentId);
  }, [visible, isMultiSelect, props.selectedCategoryId, ownerParentIdByCategoryId]);

  const handleParentPress = (parent: CategoryPickerOption) => {
    const children = childByParent.get(parent.id) ?? EMPTY_CHILDREN;
    const hasChildren = children.length > 0;
    if (hasChildren) {
      if (expandedParentId === parent.id) {
        if (allowParentSelection) {
          handleSelection(parent.id);
        } else {
          setExpandedParentId(null);
        }
        return;
      }
      setExpandedParentId(parent.id);
      return;
    }
    handleSelection(parent.id);
    setExpandedParentId(null);
  };

  const handleChildPress = (childId: string) => {
    handleSelection(childId);
  };

  const parentRows = useMemo<CategoryPickerOption[][]>(() => {
    const out: CategoryPickerOption[][] = [];
    for (let i = 0; i < parents.length; i += 2) out.push(parents.slice(i, i + 2));
    return out;
  }, [parents]);

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
            {isMultiSelect && props.onClear && selectedCategorySet.size > 0 ? (
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
          <ScrollView
            className="flex-1 px-4"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {parentRows.map((row, rowIndex) => {
              const expandedInRow = row.find((p) => p.id === expandedParentId);
              const expandedChildren = expandedInRow
                ? (childByParent.get(expandedInRow.id) ?? EMPTY_CHILDREN)
                : EMPTY_CHILDREN;
              const showChildren = !!expandedInRow && expandedChildren.length > 0;
              const expandedSide = expandedInRow
                ? row[0]?.id === expandedInRow.id
                  ? 'left'
                  : 'right'
                : null;
              return (
                <React.Fragment key={`row-${rowIndex}`}>
                  <View className={cn('flex-row -mx-1', showChildren ? 'mb-0' : 'mb-2')}>
                    {row.map((parent) => {
                      const children = childByParent.get(parent.id) ?? EMPTY_CHILDREN;
                      const hasChildren = children.length > 0;
                      const isExpanded = expandedParentId === parent.id && hasChildren;
                      const isParentSelected = selectedCategorySet.has(parent.id);
                      const hasSelectedChild =
                        hasChildren && children.some((c) => selectedCategorySet.has(c.id));
                      const isSelected = isParentSelected || hasSelectedChild;
                      return (
                        <View key={parent.id} className="w-1/2 px-1">
                          <Pressable
                            onPress={() => handleParentPress(parent)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                            className={cn(
                              'px-3 py-3 flex-row items-center gap-2 border border-transparent',
                              isExpanded
                                ? 'rounded-t-2xl rounded-b-none bg-primary/[0.06]'
                                : 'rounded-2xl',
                              isExpanded && isParentSelected
                                ? 'border-primary/20'
                                : !isExpanded && isSelected
                                  ? 'bg-primary/15 border-primary/30'
                                  : !isExpanded && !isSelected
                                    ? 'bg-secondary/40'
                                    : '',
                            )}
                          >
                            <CategoryEmoji icon={parent.icon} size={20} />
                            <Text
                              variant="body"
                              numberOfLines={1}
                              className={cn(
                                'flex-1',
                                (isSelected || isExpanded) && 'text-primary font-medium',
                              )}
                            >
                              {parent.name}
                            </Text>
                            {isParentSelected ? (
                              <Check size={14} color={themeColors.primary} />
                            ) : hasChildren ? (
                              <ChevronDown
                                size={14}
                                color={
                                  isSelected || isExpanded
                                    ? themeColors.primary
                                    : themeColors.textMuted
                                }
                                style={
                                  isExpanded ? styles.chevronExpanded : styles.chevronCollapsed
                                }
                              />
                            ) : null}
                          </Pressable>
                          {showChildren ? (
                            <View className={cn('h-2', isExpanded && 'bg-primary/[0.06]')} />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                  {showChildren ? (
                    <View className="flex-row -mx-1 mb-3">
                      <View className="w-full px-1">
                        <View
                          className={cn(
                            'rounded-b-2xl bg-primary/[0.06] px-3 pt-4 pb-2',
                            expandedSide === 'left' ? 'rounded-tr-2xl' : 'rounded-tl-2xl',
                          )}
                        >
                          <View className="flex-row flex-wrap -mx-1">
                            {expandedChildren.map((child) => {
                              const isChildSelected = selectedCategorySet.has(child.id);
                              const childOwnIcon = child.icon?.trim() ?? '';
                              const showChildIcon =
                                childOwnIcon.length > 0 &&
                                childOwnIcon !== (expandedInRow?.icon?.trim() ?? '');
                              return (
                                <View key={child.id} className="w-1/2 px-1 mb-2">
                                  <Pressable
                                    onPress={() => handleChildPress(child.id)}
                                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                                    className={cn(
                                      'rounded-xl px-3 py-2.5 flex-row items-center gap-2 border',
                                      isChildSelected
                                        ? 'bg-primary/20 border-primary/40'
                                        : 'bg-card border-border/30',
                                    )}
                                  >
                                    {showChildIcon ? (
                                      <CategoryEmoji icon={child.icon} size={20} hidePlaceholder />
                                    ) : null}
                                    <Text
                                      variant="body"
                                      numberOfLines={1}
                                      className={cn(
                                        'flex-1',
                                        isChildSelected && 'text-primary font-medium',
                                      )}
                                    >
                                      {child.name}
                                    </Text>
                                    {isChildSelected ? (
                                      <Check size={14} color={themeColors.primary} />
                                    ) : null}
                                  </Pressable>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : null}
                </React.Fragment>
              );
            })}
          </ScrollView>
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
