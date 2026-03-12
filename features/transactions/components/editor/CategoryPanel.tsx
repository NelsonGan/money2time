import { Check, ChevronDown } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

interface CategoryOption {
  id: string;
  name: string;
  icon: string;
}

interface CategoryPanelBaseProps {
  parents: CategoryOption[];
  childByParent: Map<string, CategoryOption[]>;
  allowParentSelection?: boolean;
}

interface CategoryPanelSingleSelectProps extends CategoryPanelBaseProps {
  selectedCategoryId: string | null;
  onSelect: (categoryId: string) => void;
}

interface CategoryPanelMultiSelectProps extends CategoryPanelBaseProps {
  selectedCategoryIds: string[];
  onToggleSelect: (categoryId: string) => void;
}

type CategoryPanelProps = CategoryPanelSingleSelectProps | CategoryPanelMultiSelectProps;
const EMPTY_SELECTED_CATEGORY_IDS: string[] = [];
const EMPTY_CATEGORY_OPTIONS: CategoryOption[] = [];
const COLS = 3;
const CATEGORY_PANEL_CONTENT_STYLE = { paddingBottom: 16 } as const;

const styles = StyleSheet.create({
  chevronCollapsed: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  parentSelectedBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function CategoryPanel(props: CategoryPanelProps) {
  const { parents, childByParent, allowParentSelection = false } = props;
  const themeColors = useThemeColors();
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null);
  const isMultiSelect = 'selectedCategoryIds' in props;
  const selectedCategoryId = isMultiSelect ? null : props.selectedCategoryId;
  const selectedCategoryIds = isMultiSelect
    ? props.selectedCategoryIds
    : EMPTY_SELECTED_CATEGORY_IDS;
  const selectedCategorySet = useMemo(() => {
    if (isMultiSelect) return new Set(selectedCategoryIds);
    return new Set(selectedCategoryId ? [selectedCategoryId] : []);
  }, [isMultiSelect, selectedCategoryId, selectedCategoryIds]);
  const ownerParentIdByCategoryId = useMemo(() => {
    const owners = new Map<string, string>();
    parents.forEach((parent) => {
      owners.set(parent.id, parent.id);
      const children = childByParent.get(parent.id) ?? EMPTY_CATEGORY_OPTIONS;
      children.forEach((child) => {
        owners.set(child.id, parent.id);
      });
    });
    return owners;
  }, [childByParent, parents]);
  const selectedChildCountByParentId = useMemo(() => {
    const counts = new Map<string, number>();
    if (selectedCategorySet.size === 0) return counts;

    parents.forEach((parent) => {
      const children = childByParent.get(parent.id) ?? EMPTY_CATEGORY_OPTIONS;
      if (children.length === 0) return;
      let selectedCount = 0;
      children.forEach((child) => {
        if (selectedCategorySet.has(child.id)) selectedCount += 1;
      });
      if (selectedCount > 0) {
        counts.set(parent.id, selectedCount);
      }
    });
    return counts;
  }, [childByParent, parents, selectedCategorySet]);

  const handleSelection = (categoryId: string) => {
    if (isMultiSelect) {
      props.onToggleSelect(categoryId);
      return;
    }
    props.onSelect(categoryId);
  };
  const handleToggleExpanded = (parentId: string) => {
    setExpandedParentId((previous) => (previous === parentId ? null : parentId));
  };

  useEffect(() => {
    if (isMultiSelect) return;

    if (!selectedCategoryId) return;
    const ownerParentId = ownerParentIdByCategoryId.get(selectedCategoryId);
    if (ownerParentId) setExpandedParentId(ownerParentId);
  }, [isMultiSelect, ownerParentIdByCategoryId, selectedCategoryId]);

  const parentRows = useMemo(() => chunk(parents, COLS), [parents]);

  return (
    <ScrollView
      className="flex-1 px-4 pt-2"
      showsVerticalScrollIndicator={false}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      contentContainerStyle={CATEGORY_PANEL_CONTENT_STYLE}
    >
      <View className="gap-3">
        {parentRows.map((row, rowIndex) => {
          const expandedInRow = expandedParentId
            ? row.find((p) => p.id === expandedParentId)
            : null;
          const expandedChildren = expandedInRow
            ? (childByParent.get(expandedInRow.id) ?? EMPTY_CATEGORY_OPTIONS)
            : EMPTY_CATEGORY_OPTIONS;
          const childRows = expandedChildren.length > 0 ? chunk(expandedChildren, COLS) : [];

          return (
            <React.Fragment key={rowIndex}>
              {/* Parent row */}
              <View className="flex-row gap-2">
                {row.map((parent) => {
                  const children = childByParent.get(parent.id) ?? EMPTY_CATEGORY_OPTIONS;
                  const selectedChildCount = selectedChildCountByParentId.get(parent.id) ?? 0;
                  const hasSelectedChild = selectedChildCount > 0;
                  const isParentSelected = selectedCategorySet.has(parent.id);
                  const parentSelectionState = isParentSelected
                    ? 'full'
                    : hasSelectedChild
                      ? 'partial'
                      : 'none';
                  const isExpanded = expandedParentId === parent.id;
                  const isSelected = parentSelectionState !== 'none';
                  const hasChildren = children.length > 0;

                  return (
                    <View key={parent.id} className="flex-1">
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          if (hasChildren) {
                            if (allowParentSelection) {
                              handleSelection(parent.id);
                              setExpandedParentId(parent.id);
                            } else {
                              handleToggleExpanded(parent.id);
                            }
                            return;
                          }
                          handleSelection(parent.id);
                          setExpandedParentId(null);
                        }}
                        className={cn(
                          'rounded-xl border px-2.5 py-2.5 flex-row items-center',
                          parentSelectionState === 'full'
                            ? 'bg-primary/16 border-primary/65'
                            : parentSelectionState === 'partial'
                              ? 'bg-primary/8 border-primary/45'
                              : 'bg-card border-border/30',
                        )}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: parentSelectionState !== 'none',
                          expanded: hasChildren ? isExpanded : undefined,
                        }}
                      >
                        <Text className="text-[15px] mr-1.5">{parent.icon}</Text>
                        <Text
                          variant="caption"
                          numberOfLines={1}
                          className={cn('flex-1', isSelected ? 'text-primary' : 'text-foreground')}
                        >
                          {parent.name}
                        </Text>

                        {allowParentSelection && hasChildren ? (
                          <View className="ml-0.5 flex-row items-center gap-1">
                            {parentSelectionState === 'full' ? (
                              <View
                                style={styles.parentSelectedBadge}
                                className="bg-primary border border-primary/60"
                              >
                                <Check size={10} color="#FFFFFF" />
                              </View>
                            ) : parentSelectionState === 'partial' ? (
                              <View
                                style={styles.parentSelectedBadge}
                                className="bg-primary/14 border border-primary/35"
                              >
                                <Text variant="label" className="text-primary text-[10px]">
                                  {selectedChildCount}
                                </Text>
                              </View>
                            ) : null}

                            <Pressable
                              onPress={(event) => {
                                event.stopPropagation();
                                void triggerHaptic('selection');
                                handleToggleExpanded(parent.id);
                              }}
                              hitSlop={6}
                              accessibilityRole="button"
                              accessibilityState={{ expanded: isExpanded }}
                              className="rounded-full p-0.5"
                            >
                              <ChevronDown
                                size={13}
                                color={isSelected ? themeColors.primary : themeColors.textMuted}
                                style={
                                  isExpanded ? styles.chevronExpanded : styles.chevronCollapsed
                                }
                              />
                            </Pressable>
                          </View>
                        ) : isParentSelected && !hasSelectedChild ? (
                          <Check size={14} color={themeColors.primary} />
                        ) : hasChildren ? (
                          <ChevronDown
                            size={13}
                            color={isSelected ? themeColors.primary : themeColors.textMuted}
                            style={isExpanded ? styles.chevronExpanded : styles.chevronCollapsed}
                          />
                        ) : null}
                      </Pressable>
                    </View>
                  );
                })}
                {row.length < COLS &&
                  Array.from({ length: COLS - row.length }, (_, i) => (
                    <View key={`pad-${i}`} className="flex-1" />
                  ))}
              </View>

              {/* Expanded children - full width below row */}
              {childRows.map((childRow, childRowIndex) => (
                <View key={`children-${childRowIndex}`} className="flex-row gap-2">
                  {childRow.map((child) => {
                    const isChildSelected = selectedCategorySet.has(child.id);
                    return (
                      <View key={child.id} className="flex-1">
                        <Pressable
                          onPress={() => {
                            void triggerHaptic('selection');
                            handleSelection(child.id);
                          }}
                          className={cn(
                            'rounded-xl border px-2.5 py-2 flex-row items-center',
                            isChildSelected
                              ? 'bg-primary/14 border-primary/55'
                              : 'bg-secondary/45 border-border/20',
                          )}
                        >
                          <Text className="text-[13px] mr-1.5">{child.icon}</Text>
                          <Text
                            variant="caption"
                            numberOfLines={1}
                            className={cn(
                              'flex-1',
                              isChildSelected ? 'text-primary' : 'text-muted-foreground',
                            )}
                          >
                            {child.name}
                          </Text>
                          {isChildSelected ? <Check size={12} color={themeColors.primary} /> : null}
                        </Pressable>
                      </View>
                    );
                  })}
                  {childRow.length < COLS &&
                    Array.from({ length: COLS - childRow.length }, (_, i) => (
                      <View key={`cpad-${i}`} className="flex-1" />
                    ))}
                </View>
              ))}
            </React.Fragment>
          );
        })}
      </View>
    </ScrollView>
  );
}
