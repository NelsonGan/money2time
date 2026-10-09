import { Check, ChevronDown } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export interface CategoryPickerOption {
  id: string;
  name: string;
  icon: string;
}

interface CategoryGridBaseProps {
  parents: CategoryPickerOption[];
  childByParent: Map<string, CategoryPickerOption[]>;
  allowParentSelection?: boolean;
  /** Scroll the grid internally (default). Set false to let a parent scroll it. */
  scrollEnabled?: boolean;
  className?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

interface CategoryGridSingleProps extends CategoryGridBaseProps {
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
  selectedCategoryIds?: never;
  onToggleSelect?: never;
}

interface CategoryGridMultiProps extends CategoryGridBaseProps {
  selectedCategoryIds: string[];
  onToggleSelect: (categoryId: string) => void;
  selectedCategoryId?: never;
  onSelect?: never;
}

export type CategoryGridProps = CategoryGridSingleProps | CategoryGridMultiProps;

const styles = StyleSheet.create({
  chevronCollapsed: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
});

const EMPTY_CHILDREN: CategoryPickerOption[] = [];

/**
 * The two-column, expandable category picker grid. Extracted from
 * {@link CategoryPickerSheet} so the same layout can render inline (the
 * transaction editor's background) and inside the modal sheet. Memoised so the
 * editor's inactive pager pages don't re-render on every amount keystroke.
 */
export const CategoryGrid = React.memo(function CategoryGrid(props: CategoryGridProps) {
  const {
    parents,
    childByParent,
    allowParentSelection = false,
    scrollEnabled = true,
    className,
    contentContainerStyle,
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
    if (isMultiSelect) return;
    if (!props.selectedCategoryId) return;
    const ownerParentId = ownerParentIdByCategoryId.get(props.selectedCategoryId);
    if (ownerParentId) setExpandedParentId(ownerParentId);
  }, [isMultiSelect, props.selectedCategoryId, ownerParentIdByCategoryId]);

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

  return (
    <ScrollView
      className={className}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentContainerStyle}
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
                      accessibilityRole="button"
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
                            isSelected || isExpanded ? themeColors.primary : themeColors.textMuted
                          }
                          style={isExpanded ? styles.chevronExpanded : styles.chevronCollapsed}
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
                              accessibilityRole="button"
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
  );
});
