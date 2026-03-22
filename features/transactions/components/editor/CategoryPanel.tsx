import { ChevronDown } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';

interface CategoryOption {
  id: string;
  name: string;
  icon: string;
}

interface CategoryPanelBaseProps {
  parents: CategoryOption[];
  childByParent: Map<string, CategoryOption[]>;
  allowParentSelection?: boolean;
  onBackgroundPress?: () => void;
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
const GRID_DIVIDER_WIDTH = 1;
const CATEGORY_PANEL_CONTENT_STYLE = { paddingBottom: 16, flexGrow: 1 } as const;

const styles = StyleSheet.create({
  chevronCollapsed: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  gridRow: {
    flexDirection: 'row',
    minHeight: 58,
  },
  gridCell: {
    flex: 1,
    minHeight: 58,
  },
  gridCellButton: {
    flex: 1,
    minHeight: 58,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'relative',
  },
  gridLabel: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  inlineContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  inlineIcon: {
    marginRight: 6,
  },
  cornerRight: {
    position: 'absolute',
    right: 6,
    top: 6,
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
  const { parents, childByParent, allowParentSelection = false, onBackgroundPress } = props;
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
  const selectedChildParentIdSet = useMemo(() => {
    const parentIds = new Set<string>();
    if (selectedCategorySet.size === 0) return parentIds;

    parents.forEach((parent) => {
      const children = childByParent.get(parent.id) ?? EMPTY_CATEGORY_OPTIONS;
      if (children.length === 0) return;
      if (children.some((child) => selectedCategorySet.has(child.id))) {
        parentIds.add(parent.id);
      }
    });
    return parentIds;
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
  const gridDividerColor = themeColors.border;

  const renderGridRow = <T,>(
    rowKey: string,
    items: T[],
    _rowIndex: number,
    renderCell: (item: T) => React.ReactNode,
  ) => {
    const populatedColumnCount = items.length;

    return (
      <View key={rowKey} style={styles.gridRow}>
        {Array.from({ length: COLS }, (_, columnIndex) => {
          const item = items[columnIndex];
          const hasItem = item !== undefined;
          const shouldShowRightBorder =
            hasItem && (columnIndex < populatedColumnCount - 1 || populatedColumnCount < COLS);

          return (
            <View
              key={`${rowKey}-${columnIndex}`}
              style={[
                styles.gridCell,
                hasItem ? { backgroundColor: themeColors.surface } : null,
                hasItem
                  ? { borderBottomWidth: GRID_DIVIDER_WIDTH, borderBottomColor: gridDividerColor }
                  : null,
                shouldShowRightBorder
                  ? { borderRightWidth: GRID_DIVIDER_WIDTH, borderRightColor: gridDividerColor }
                  : null,
              ]}
            >
              {hasItem ? renderCell(item) : null}
            </View>
          );
        })}
      </View>
    );
  };

  const groupedRows = parentRows.flatMap((row, rowIndex) => {
    const rows: { key: string; kind: 'parent' | 'child'; items: CategoryOption[] }[] = [
      { key: `parent-${rowIndex}`, kind: 'parent', items: row },
    ];
    const expandedInRow = expandedParentId ? row.find((parent) => parent.id === expandedParentId) : null;
    if (!expandedInRow) return rows;

    chunk(childByParent.get(expandedInRow.id) ?? EMPTY_CATEGORY_OPTIONS, COLS).forEach(
      (childRow, childRowIndex) => {
        rows.push({
          key: `parent-${expandedInRow.id}-children-${childRowIndex}`,
          kind: 'child',
          items: childRow,
        });
      },
    );
    return rows;
  });

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      contentContainerStyle={CATEGORY_PANEL_CONTENT_STYLE}
    >
      {groupedRows.map((row, rowIndex) =>
        row.kind === 'parent'
          ? renderGridRow(row.key, row.items, rowIndex, (parent) => {
              const children = childByParent.get(parent.id) ?? EMPTY_CATEGORY_OPTIONS;
              const hasSelectedChild = selectedChildParentIdSet.has(parent.id);
              const isParentSelected = selectedCategorySet.has(parent.id);
              const isExpanded = expandedParentId === parent.id;
              const isSelected = isParentSelected || hasSelectedChild;
              const hasChildren = children.length > 0;

              return (
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
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: isSelected,
                    expanded: hasChildren ? isExpanded : undefined,
                  }}
                  style={[
                    styles.gridCellButton,
                    {
                      backgroundColor: isSelected
                        ? themeColors.primarySoft
                        : isExpanded
                          ? themeColors.surfaceMuted
                          : 'transparent',
                    },
                  ]}
                >
                  {allowParentSelection && hasChildren && isMultiSelect ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        void triggerHaptic('selection');
                        handleToggleExpanded(parent.id);
                      }}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isExpanded }}
                      style={styles.cornerRight}
                    >
                      <ChevronDown
                        size={13}
                        color={isSelected || isExpanded ? themeColors.primary : themeColors.textMuted}
                        style={isExpanded ? styles.chevronExpanded : styles.chevronCollapsed}
                      />
                    </Pressable>
                  ) : hasChildren ? (
                    <View style={styles.cornerRight}>
                      <ChevronDown
                        size={13}
                        color={isSelected || isExpanded ? themeColors.primary : themeColors.textMuted}
                        style={isExpanded ? styles.chevronExpanded : styles.chevronCollapsed}
                      />
                    </View>
                  ) : null}

                  <View style={styles.inlineContent}>
                    <Text style={styles.inlineIcon}>{parent.icon}</Text>
                    <Text
                      variant="caption"
                      numberOfLines={2}
                      style={[
                        styles.gridLabel,
                        { color: isSelected ? themeColors.primary : themeColors.text },
                      ]}
                    >
                      {parent.name}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          : renderGridRow(row.key, row.items, rowIndex, (child) => {
              const isChildSelected = selectedCategorySet.has(child.id);
              return (
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    handleSelection(child.id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isChildSelected }}
                  style={[
                    styles.gridCellButton,
                    {
                      backgroundColor: isChildSelected ? themeColors.primarySoft : 'transparent',
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    numberOfLines={2}
                    style={[
                      styles.gridLabel,
                      { color: isChildSelected ? themeColors.primary : themeColors.textMuted },
                    ]}
                  >
                    {child.name}
                  </Text>
                </Pressable>
              );
            }),
      )}
      <Pressable accessible={false} onPress={onBackgroundPress} style={{ flex: 1 }} />
    </ScrollView>
  );
}
