import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';

import { Text } from '~/components/ui/text';
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
const COLS = 3;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export function CategoryPanel(props: CategoryPanelProps) {
  const { parents, childByParent } = props;
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

  const handleSelection = (categoryId: string) => {
    if (isMultiSelect) {
      props.onToggleSelect(categoryId);
      return;
    }
    props.onSelect(categoryId);
  };

  useEffect(() => {
    if (isMultiSelect) {
      if (selectedCategoryIds.length === 0) return;
      const selectedParent = parents.find((parent) => {
        if (selectedCategorySet.has(parent.id)) return true;
        return (childByParent.get(parent.id) ?? []).some((child) =>
          selectedCategorySet.has(child.id),
        );
      });
      if (selectedParent) setExpandedParentId(selectedParent.id);
      return;
    }

    if (!selectedCategoryId) return;
    const selectedParent = parents.find((parent) => parent.id === selectedCategoryId);
    if (selectedParent) {
      setExpandedParentId(selectedParent.id);
      return;
    }

    const ownerParent = parents.find((p) =>
      (childByParent.get(p.id) ?? []).some((child) => child.id === selectedCategoryId),
    );
    if (ownerParent) setExpandedParentId(ownerParent.id);
  }, [
    childByParent,
    isMultiSelect,
    parents,
    selectedCategoryId,
    selectedCategoryIds,
    selectedCategorySet,
  ]);

  const parentRows = useMemo(() => chunk(parents, COLS), [parents]);

  return (
    <ScrollView
      className="flex-1 px-4 pt-2"
      showsVerticalScrollIndicator={false}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      contentContainerStyle={{ paddingBottom: 16 }}
    >
      <View className="gap-3">
        {parentRows.map((row, rowIndex) => {
          const expandedInRow = expandedParentId
            ? row.find((p) => p.id === expandedParentId)
            : null;
          const expandedChildren = expandedInRow
            ? (childByParent.get(expandedInRow.id) ?? [])
            : [];
          const childRows = expandedChildren.length > 0 ? chunk(expandedChildren, COLS) : [];

          return (
            <React.Fragment key={rowIndex}>
              {/* Parent row */}
              <View className="flex-row gap-2">
                {row.map((parent) => {
                  const children = childByParent.get(parent.id) ?? [];
                  const hasSelectedChild = children.some((child) =>
                    selectedCategorySet.has(child.id),
                  );
                  const isParentSelected = selectedCategorySet.has(parent.id);
                  const isSelected = isParentSelected || hasSelectedChild;
                  const isExpanded = expandedParentId === parent.id;

                  return (
                    <View key={parent.id} className="flex-1">
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          if (children.length > 0) {
                            setExpandedParentId((prev) =>
                              prev === parent.id ? null : parent.id,
                            );
                            return;
                          }
                          handleSelection(parent.id);
                        }}
                        className={cn(
                          'rounded-xl border px-2.5 py-2.5 flex-row items-center',
                          isSelected
                            ? 'bg-primary/10 border-primary/45'
                            : isExpanded
                              ? 'bg-primary/5 border-primary/30'
                              : 'bg-card border-border/30',
                        )}
                      >
                        <Text className="text-[15px] mr-1.5">{parent.icon}</Text>
                        <Text
                          variant="caption"
                          numberOfLines={1}
                          className={cn(
                            'flex-1',
                            isSelected || isExpanded
                              ? 'text-primary'
                              : 'text-foreground',
                          )}
                        >
                          {parent.name}
                        </Text>
                        {isParentSelected && !hasSelectedChild ? (
                          <Check size={14} color={themeColors.primary} />
                        ) : children.length > 0 ? (
                          <ChevronDown
                            size={13}
                            color={
                              isSelected || isExpanded
                                ? themeColors.primary
                                : themeColors.textMuted
                            }
                            style={{
                              transform: [{ rotate: isExpanded ? '180deg' : '0deg' }],
                            }}
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
                              ? 'bg-primary/10 border-primary/40'
                              : 'bg-secondary/50 border-border/20',
                          )}
                        >
                          <Text className="text-[13px] mr-1.5">{child.icon}</Text>
                          <Text
                            variant="label"
                            numberOfLines={1}
                            className={cn(
                              'flex-1',
                              isChildSelected
                                ? 'text-primary'
                                : 'text-muted-foreground',
                            )}
                          >
                            {child.name}
                          </Text>
                          {isChildSelected ? (
                            <Check size={12} color={themeColors.primary} />
                          ) : null}
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
