import { ChevronDown, ChevronRight, GripVertical, Plus, Trash2, X } from 'lucide-react-native';
import { type ElementRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import type { AnimatedRef } from 'react-native-reanimated';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  Button,
  CategoryEmoji,
  type CategoryPickerOption,
  CategoryPickerSheet,
  FormScrollView,
  Input,
  SegmentedToggle,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { DEFAULT_CATEGORY_ICONS } from '~/constants/appDefaults';
import type { CategoryIconPickerSession } from '~/features/settings/lib/categoryIconPickerBridge';

import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType } from '~/types';
import { cn } from '~/utils';
import { suggestCategoryIcon } from '~/utils/categoryIconMatcher';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

const CATEGORY_EDITOR_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
} as const;
const CATEGORY_LIST_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
} as const;

const styles = StyleSheet.create({
  parentCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },
  parentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    gap: spacing.xs,
  },
  chevronButton: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  parentEmoji: {
    fontSize: 22,
    width: 30,
    textAlign: 'center',
    flexShrink: 0,
  },
  parentNamePressable: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  parentName: {
    fontSize: 15,
    fontFamily: FONT.bold,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  parentAddButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  parentHandle: {
    width: 30,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  childrenPanel: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    marginTop: 2,
    padding: spacing.xs + 2,
    borderRadius: 16,
  },
  childCell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: spacing.xs,
    paddingLeft: 2,
    paddingRight: spacing.sm,
    borderRadius: 13,
    borderWidth: 1,
    gap: 4,
  },
  childHandle: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  childTapArea: {
    flex: 1,
    minHeight: 32,
    justifyContent: 'center',
  },
  childInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childEmoji: {
    fontSize: 15,
    flexShrink: 0,
  },
  childName: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT.medium,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  childEmptyText: {
    fontSize: 12,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  headerSpacer: {
    height: spacing.xs,
  },
  listContainer: {
    flex: 1,
  },
});

function isCategoryType(value: string): value is CategoryType {
  return value === 'expense' || value === 'income';
}

const EMPTY_CHILD_MAP: Map<string, CategoryPickerOption[]> = new Map();

function CategoryEditor({
  mode,
  topLevel,
  initial,
  disableParentSelect = false,
  affectedCount = 0,
  reassignParents = [],
  reassignChildByParent = EMPTY_CHILD_MAP,
  onClose,
  onSubmit,
  onDelete,
  onOpenIconPicker,
}: {
  mode: 'create' | 'edit';
  topLevel: Category[];
  initial?: Partial<Category>;
  // A category that already has children cannot itself become a child — that
  // would create a third nesting level. Hide the parent selector in that case.
  disableParentSelect?: boolean;
  // Number of transactions using this category (and its children) — drives the
  // delete prompt's reassign option.
  affectedCount?: number;
  reassignParents?: CategoryPickerOption[];
  reassignChildByParent?: Map<string, CategoryPickerOption[]>;
  onClose: () => void;
  onSubmit: (input: { name: string; icon: string; parentId: string | null }) => void;
  onDelete?: (reassignToCategoryId?: string) => void;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
}) {
  const themeColors = useThemeColors();
  const initialIcon = initial?.icon ?? (initial?.parentId ? '' : DEFAULT_CATEGORY_ICONS[0]);
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initialIcon);
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? null);
  const [iconManuallyPicked, setIconManuallyPicked] = useState(mode === 'edit');
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [reassignPickerOpen, setReassignPickerOpen] = useState(false);

  const parentPickerParents = useMemo<CategoryPickerOption[]>(
    () =>
      topLevel
        .filter((category) => category.id !== initial?.id)
        .map((category) => ({ id: category.id, name: category.name, icon: category.icon })),
    [initial?.id, topLevel],
  );
  const parentPickerChildren = useMemo(() => new Map<string, CategoryPickerOption[]>(), []);
  const selectedParent = parentId ? topLevel.find((category) => category.id === parentId) : null;

  // Resolve a reassign-target id to its name for the confirmation prompt.
  const reassignNameById = useMemo(() => {
    const map = new Map<string, string>();
    reassignParents.forEach((option) => map.set(option.id, option.name));
    reassignChildByParent.forEach((children) =>
      children.forEach((option) => map.set(option.id, option.name)),
    );
    return map;
  }, [reassignParents, reassignChildByParent]);

  const confirmMoveAndDelete = (targetId: string) => {
    setReassignPickerOpen(false);
    Alert.alert(
      I18n.t('categories.move_confirm_title'),
      I18n.t('categories.move_confirm_body', { name: reassignNameById.get(targetId) ?? '' }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('categories.move_confirm_action'),
          style: 'destructive',
          onPress: () => {
            void triggerHaptic('warning');
            onDelete?.(targetId);
          },
        },
      ],
    );
  };

  useEffect(() => {
    if (iconManuallyPicked || parentId !== null) return;
    const timer = setTimeout(() => {
      const suggested = suggestCategoryIcon(name);
      if (suggested) setIcon(suggested);
    }, 400);
    return () => clearTimeout(timer);
  }, [name, iconManuallyPicked, parentId]);

  const canSave = name.trim().length > 0;

  const hasReassignTargets = reassignParents.length > 0 || reassignChildByParent.size > 0;

  const handleDelete = () => {
    if (!onDelete) return;
    if (affectedCount > 0) {
      Alert.alert(
        I18n.t('categories.delete_title'),
        I18n.t('categories.delete_has_transactions_body', { count: affectedCount }),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          ...(hasReassignTargets
            ? [
                {
                  text: I18n.t('categories.delete_move_to_other'),
                  onPress: () => setReassignPickerOpen(true),
                },
              ]
            : []),
          {
            text: I18n.t('categories.delete_keep_delete'),
            style: 'destructive' as const,
            onPress: () => {
              void triggerHaptic('warning');
              onDelete();
            },
          },
        ],
      );
      return;
    }
    Alert.alert(I18n.t('common.delete'), I18n.t('categories.delete_confirm'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void triggerHaptic('warning');
          onDelete();
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <SettingsHeader
          className="px-5 pt-5 pb-3"
          title={
            mode === 'create'
              ? I18n.t('categories.new_category')
              : I18n.t('categories.edit_category')
          }
          onBack={onClose}
          closeRowAccessory={
            mode === 'edit' && onDelete ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
                className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10"
              >
                <Trash2 size={18} color={themeColors.error} />
              </Pressable>
            ) : undefined
          }
        />
        <FormScrollView contentContainerStyle={CATEGORY_EDITOR_SCROLL_CONTENT_STYLE}>
          <View className="gap-4">
            <Input label={I18n.t('categories.name')} value={name} onChangeText={setName} />
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('categories.icon')}
              </Text>
              <View className="flex-row items-center gap-1 rounded-2xl border border-border/40 bg-card pr-3">
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onOpenIconPicker({
                      selectedValue: icon || null,
                      onSelect: (value) => {
                        setIconManuallyPicked(true);
                        setIcon(value ?? '');
                      },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('category_icon.choose_title')}
                  className="flex-1 flex-row items-center gap-3 px-4 py-3 active:opacity-80"
                >
                  <View className="h-[54px] w-[54px] items-center justify-center rounded-[18px] bg-secondary/30">
                    <CategoryEmoji icon={icon} size={30} hidePlaceholder={!icon} />
                  </View>
                  <Text className="flex-1 text-muted-foreground">
                    {I18n.t('category_icon.choose_title')}
                  </Text>
                </Pressable>
                {icon ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setIconManuallyPicked(true);
                      setIcon('');
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('category_icon.clear')}
                    className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
                  >
                    <X size={15} color={themeColors.textMuted} />
                  </Pressable>
                ) : null}
                <ChevronRight size={18} color={themeColors.textMuted} />
              </View>
            </View>

            {disableParentSelect ? null : (
              <View>
                <Text variant="label" tone="muted" className="mb-2">
                  {I18n.t('categories.parent_optional')}
                </Text>
                <View className="flex-row items-center rounded-2xl border border-border/40 bg-card">
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setParentPickerOpen(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('categories.parent_optional')}
                    className="flex-1 flex-row items-center gap-2 px-4 py-3"
                  >
                    {selectedParent && selectedParent.icon.trim().length > 0 ? (
                      <CategoryEmoji icon={selectedParent.icon} size={20} />
                    ) : null}
                    <Text
                      numberOfLines={1}
                      className={cn(selectedParent ? 'text-foreground' : 'text-muted-foreground')}
                    >
                      {selectedParent ? selectedParent.name : I18n.t('ui.select.placeholder')}
                    </Text>
                  </Pressable>
                  {selectedParent ? (
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setParentId(null);
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.clear')}
                      className="px-4 py-3"
                    >
                      <X size={18} color={themeColors.textMuted} />
                    </Pressable>
                  ) : (
                    <View className="pr-4">
                      <ChevronDown size={18} color={themeColors.textMuted} />
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </FormScrollView>
        <SettingsActionBar
          onCancel={onClose}
          onSave={() => {
            if (!canSave) return;
            const normalizedIcon = icon.trim();
            onSubmit({
              name: name.trim(),
              icon: normalizedIcon,
              parentId,
            });
          }}
          saveDisabled={!canSave}
        />
        <CategoryPickerSheet
          visible={parentPickerOpen}
          onClose={() => setParentPickerOpen(false)}
          parents={parentPickerParents}
          childByParent={parentPickerChildren}
          allowParentSelection
          overlay
          selectedCategoryId={parentId}
          onSelect={(id) => {
            setParentId(id);
            setParentPickerOpen(false);
          }}
        />
        <CategoryPickerSheet
          visible={reassignPickerOpen}
          onClose={() => setReassignPickerOpen(false)}
          parents={reassignParents}
          childByParent={reassignChildByParent}
          allowParentSelection
          overlay
          selectedCategoryId={null}
          onSelect={confirmMoveAndDelete}
        />
      </View>
    </SafeAreaView>
  );
}

/** Full-page create/edit category editor (native-stack screen). */
export function CategoryEditorScreen({
  categoryId,
  parentId,
  type = 'expense',
  onClose,
  onOpenIconPicker,
}: {
  categoryId?: string;
  parentId?: string;
  type?: CategoryType;
  onClose: () => void;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
}) {
  const { categories, createCategory, updateCategory, deleteCategory } = useApp();
  const { transactions } = useTransactions();

  const editing = categoryId ? (categories.find((c) => c.id === categoryId) ?? null) : null;
  const mode: 'create' | 'edit' = editing ? 'edit' : 'create';
  const effectiveType: CategoryType = editing?.type ?? type;

  const { topLevel, childCountByParent } = useMemo(() => {
    const nextTopLevel: Category[] = [];
    const counts = new Map<string, number>();
    categories.forEach((category) => {
      if (category.type !== effectiveType) return;
      if (!category.parentId) nextTopLevel.push(category);
      else counts.set(category.parentId, (counts.get(category.parentId) ?? 0) + 1);
    });
    return { topLevel: nextTopLevel, childCountByParent: counts };
  }, [categories, effectiveType]);

  const editingDeleteInfo = useMemo(() => {
    if (!editing) {
      return { count: 0, parents: [] as CategoryPickerOption[], childByParent: EMPTY_CHILD_MAP };
    }
    const editingChildIds = new Set(
      categories.filter((category) => category.parentId === editing.id).map((c) => c.id),
    );
    const count = transactions.filter((t) => t.categoryId === editing.id).length;
    const parents: CategoryPickerOption[] = [];
    const childByParent = new Map<string, CategoryPickerOption[]>();
    categories.forEach((category) => {
      if (category.type !== editing.type || category.id === editing.id) return;
      const option = { id: category.id, name: category.name, icon: category.icon };
      if (!category.parentId || editingChildIds.has(category.id)) {
        parents.push(option);
        return;
      }
      const existing = childByParent.get(category.parentId);
      if (existing) existing.push(option);
      else childByParent.set(category.parentId, [option]);
    });
    return { count, parents, childByParent };
  }, [editing, categories, transactions]);

  const initial =
    editing ?? (parentId ? { parentId, type: effectiveType } : { type: effectiveType });

  return (
    <CategoryEditor
      mode={mode}
      topLevel={topLevel}
      initial={initial}
      disableParentSelect={!!editing && (childCountByParent.get(editing.id) ?? 0) > 0}
      affectedCount={editingDeleteInfo.count}
      reassignParents={editingDeleteInfo.parents}
      reassignChildByParent={editingDeleteInfo.childByParent}
      onClose={onClose}
      onOpenIconPicker={onOpenIconPicker}
      onSubmit={(input) => {
        if (editing) updateCategory(editing.id, input);
        else createCategory({ ...input, type: effectiveType, isDefault: false });
        onClose();
      }}
      onDelete={
        editing
          ? (reassignToCategoryId) => {
              deleteCategory(
                editing.id,
                reassignToCategoryId ? { reassignToCategoryId } : undefined,
              );
              onClose();
            }
          : undefined
      }
    />
  );
}

type CategoryRowThemeColors = {
  border: string;
  card: string;
  cardMuted: string;
  primary: string;
  primaryMuted: string;
  primarySoft: string;
  textMuted: string;
  textFaint: string;
  text: string;
};

function ChildCell({
  item,
  themeColors,
  onEdit,
}: {
  item: Category;
  themeColors: CategoryRowThemeColors;
  onEdit: (item: Category) => void;
}) {
  const tc = themeColors;
  const hasIcon = item.icon.trim().length > 0;
  return (
    <View
      style={[
        styles.childCell,
        {
          borderColor: tc.border,
          backgroundColor: tc.card,
        },
      ]}
    >
      <Sortable.Handle>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${I18n.t('common.reorder')} ${item.name}`}
          style={styles.childHandle}
        >
          <GripVertical size={13} color={tc.textFaint} />
        </View>
      </Sortable.Handle>
      <Pressable
        onPress={() => onEdit(item)}
        style={styles.childTapArea}
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        <View style={styles.childInner}>
          {hasIcon ? <CategoryEmoji style={styles.childEmoji} size={15} icon={item.icon} /> : null}
          <Text style={[styles.childName, { color: tc.text }]} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function ParentCard({
  item,
  themeColors,
  rowWidth,
  childItems,
  expanded,
  scrollableRef,
  onToggleExpand,
  onEditParent,
  onAddChild,
  onEditChild,
  onReorderChildren,
}: {
  item: Category;
  themeColors: CategoryRowThemeColors;
  rowWidth: number;
  childItems: Category[];
  expanded: boolean;
  scrollableRef: AnimatedRef<Animated.ScrollView>;
  onToggleExpand: (parentId: string) => void;
  onEditParent: (item: Category) => void;
  onAddChild: (parentId: string) => void;
  onEditChild: (item: Category) => void;
  onReorderChildren: (parentId: string, ordered: Category[]) => void;
}) {
  const tc = themeColors;
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const hasIcon = item.icon.trim().length > 0;
  return (
    <View
      style={[
        styles.parentCard,
        { width: rowWidth },
        {
          borderColor: expanded ? tc.primaryMuted : tc.border,
          backgroundColor: tc.card,
        },
      ]}
    >
      <View style={styles.parentHeader}>
        <Pressable
          onPress={() => onToggleExpand(item.id)}
          hitSlop={6}
          style={styles.chevronButton}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? I18n.t('categories.collapse') : I18n.t('categories.expand')
          }
          accessibilityState={{ expanded }}
        >
          <ChevronIcon size={18} color={expanded ? tc.primary : tc.textMuted} />
        </Pressable>
        {hasIcon ? <CategoryEmoji style={styles.parentEmoji} size={22} icon={item.icon} /> : null}
        <Pressable
          onPress={() => onEditParent(item)}
          style={styles.parentNamePressable}
          accessibilityRole="button"
          accessibilityLabel={item.name}
        >
          <Text style={[styles.parentName, { color: tc.text }]} numberOfLines={1}>
            {item.name}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onAddChild(item.id)}
          hitSlop={4}
          style={[styles.parentAddButton, { backgroundColor: tc.primarySoft }]}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('categories.add_subcategory')}
        >
          <Plus size={16} color={tc.primary} />
        </Pressable>
        <Sortable.Handle>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${I18n.t('common.reorder')} ${item.name}`}
            style={styles.parentHandle}
          >
            <GripVertical size={16} color={tc.textFaint} />
          </View>
        </Sortable.Handle>
      </View>

      {expanded ? (
        <View style={[styles.childrenPanel, { backgroundColor: tc.cardMuted }]}>
          {childItems.length > 0 ? (
            <Sortable.Grid
              columns={2}
              data={childItems}
              keyExtractor={(child) => child.id}
              columnGap={spacing.xs}
              rowGap={spacing.xs}
              customHandle
              dragActivationDelay={0}
              activeItemScale={1.03}
              activeItemShadowOpacity={0.08}
              inactiveItemOpacity={1}
              scrollableRef={scrollableRef}
              onDragEnd={({ data }) => {
                onReorderChildren(item.id, data);
                void triggerHaptic('selection');
              }}
              renderItem={({ item: child }) => (
                <ChildCell item={child} themeColors={tc} onEdit={onEditChild} />
              )}
            />
          ) : (
            <Text style={[styles.childEmptyText, { color: tc.textMuted }]}>
              {I18n.t('categories.no_subcategories')}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

interface CategoriesScreenProps {
  onBack?: () => void;
  useNativeBackGesture?: boolean;
  onOpenCategoryEditor?: (params?: {
    categoryId?: string;
    parentId?: string;
    type?: CategoryType;
  }) => void;
}

export function CategoriesScreen({
  onBack,
  useNativeBackGesture = false,
  onOpenCategoryEditor,
}: CategoriesScreenProps = {}) {
  const { categories, reorderCategories } = useApp();
  const { checkLimit } = useProGate();
  const bottomNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const themeColors = useThemeColors();
  // The free-plan limit applies to the total number of categories (parents and
  // children alike), matching the "up to N categories" paywall copy.
  const categoryCount = categories.length;
  const { contentWidth: windowWidth } = useDeviceLayout();
  const [type, setType] = useState<CategoryType>('expense');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const scrollRef = useAnimatedRef<ElementRef<typeof Animated.ScrollView>>();
  const rowWidth = Math.max(windowWidth - SETTINGS_HORIZONTAL_PADDING * 2, 0);

  const { topLevel, childrenByParent } = useMemo(() => {
    const nextTopLevel: Category[] = [];
    const nextChildrenByParent = new Map<string, Category[]>();

    categories.forEach((category) => {
      if (category.type !== type) return;
      if (!category.parentId) {
        nextTopLevel.push(category);
        return;
      }
      const existing = nextChildrenByParent.get(category.parentId);
      if (existing) {
        existing.push(category);
      } else {
        nextChildrenByParent.set(category.parentId, [category]);
      }
    });

    return {
      topLevel: nextTopLevel,
      childrenByParent: nextChildrenByParent,
    };
  }, [categories, type]);

  const rowThemeColors = useMemo<CategoryRowThemeColors>(
    () => ({
      border: withColorAlpha(themeColors.primary, 0.18),
      card: themeColors.card,
      cardMuted: withColorAlpha(themeColors.primary, 0.06),
      primary: themeColors.primary,
      primaryMuted: themeColors.primaryMuted,
      primarySoft: themeColors.primarySoft,
      textMuted: themeColors.textMuted,
      textFaint: withColorAlpha(themeColors.textMuted, 0.55),
      text: themeColors.text,
    }),
    [
      themeColors.card,
      themeColors.primary,
      themeColors.primaryMuted,
      themeColors.primarySoft,
      themeColors.text,
      themeColors.textMuted,
    ],
  );

  // Reordering operates on a single flat sortOrder list spanning every category
  // of the current type. We emit parents in order, each immediately followed by
  // its children, so both parent and child drags persist independently.
  const buildOrderedCategoryIds = useCallback(
    ({
      reorderedChildren,
      reorderedTopLevel = topLevel,
    }: {
      reorderedChildren?: { items: Category[]; parentId: string };
      reorderedTopLevel?: Category[];
    }) => {
      const nextIds: string[] = [];
      const seen = new Set<string>();

      reorderedTopLevel.forEach((parent) => {
        if (parent.type !== type) return;
        nextIds.push(parent.id);
        seen.add(parent.id);

        const children =
          reorderedChildren?.parentId === parent.id
            ? reorderedChildren.items
            : (childrenByParent.get(parent.id) ?? []);

        children.forEach((child) => {
          if (child.type !== type || seen.has(child.id)) return;
          nextIds.push(child.id);
          seen.add(child.id);
        });
      });

      categories.forEach((category) => {
        if (category.type !== type || seen.has(category.id)) return;
        nextIds.push(category.id);
      });

      return nextIds;
    },
    [categories, childrenByParent, topLevel, type],
  );

  const handleToggleExpand = useCallback((parentId: string) => {
    void triggerHaptic('selection');
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  }, []);

  const handleEdit = useCallback(
    (item: Category) => {
      void triggerHaptic('selection');
      onOpenCategoryEditor?.({ categoryId: item.id });
    },
    [onOpenCategoryEditor],
  );

  const handleAddChild = useCallback(
    (parentId: string) => {
      if (!checkLimit('categories', categoryCount)) return;
      void triggerHaptic('selection');
      setExpandedIds((prev) => {
        if (prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
      onOpenCategoryEditor?.({ parentId, type });
    },
    [categoryCount, checkLimit, onOpenCategoryEditor, type],
  );

  const handleReorderChildren = useCallback(
    (parentId: string, ordered: Category[]) => {
      reorderCategories(
        buildOrderedCategoryIds({ reorderedChildren: { items: ordered, parentId } }),
      );
    },
    [buildOrderedCategoryIds, reorderCategories],
  );

  const content = (
    <SettingsPageLayout>
      <View style={styles.headerContainer}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.categories')}
          rightAccessory={
            <Button
              size="icon"
              haptic="none"
              onPress={() => {
                if (!checkLimit('categories', categoryCount)) return;
                void triggerHaptic('selection');
                onOpenCategoryEditor?.({ type });
              }}
            >
              <Plus size={18} color="#fff" />
            </Button>
          }
        />
        <SegmentedToggle
          value={type}
          variant="home"
          className="my-2"
          onChange={(value) => {
            if (!isCategoryType(value)) return;
            setType(value);
          }}
          options={[
            { value: 'expense', label: I18n.t('categories.expense') },
            { value: 'income', label: I18n.t('categories.income') },
          ]}
        />
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.listContainer}>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[CATEGORY_LIST_CONTENT_STYLE, bottomNavInset]}
          keyboardShouldPersistTaps="handled"
        >
          <Sortable.Flex
            activeItemScale={1.02}
            activeItemShadowOpacity={0.08}
            customHandle
            dragActivationDelay={0}
            flexDirection="column"
            flexWrap="nowrap"
            gap={spacing.xs}
            inactiveItemOpacity={1}
            onDragEnd={({ fromIndex, order, toIndex }) => {
              if (fromIndex === toIndex) return;
              const orderedTopLevel = order(topLevel);
              reorderCategories(buildOrderedCategoryIds({ reorderedTopLevel: orderedTopLevel }));
              void triggerHaptic('selection');
            }}
            scrollableRef={scrollRef}
            width="fill"
          >
            {topLevel.map((item) => (
              <ParentCard
                key={item.id}
                item={item}
                themeColors={rowThemeColors}
                rowWidth={rowWidth}
                childItems={childrenByParent.get(item.id) ?? []}
                expanded={expandedIds.has(item.id)}
                scrollableRef={scrollRef}
                onToggleExpand={handleToggleExpand}
                onEditParent={handleEdit}
                onAddChild={handleAddChild}
                onEditChild={handleEdit}
                onReorderChildren={handleReorderChildren}
              />
            ))}
          </Sortable.Flex>
        </Animated.ScrollView>
      </View>
    </SettingsPageLayout>
  );
  if (useNativeBackGesture) return content;
  return <EdgeSwipeBackContainer onBack={onBack}>{content}</EdgeSwipeBackContainer>;
}
