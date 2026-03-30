import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { type ElementRef, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  Button,
  Input,
  SegmentedToggle,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  ThemeModal,
} from '~/components/ui';
import { DEFAULT_CATEGORY_EMOJIS } from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
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
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    marginBottom: 0,
    borderRadius: 22,
    borderWidth: 1,
    gap: spacing.sm,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },
  rowIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowIconText: {
    fontSize: 18,
  },
  rowPrimaryPressable: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  rowTextStack: {
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: FONT.bold,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowActionButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

function CategoryEditor({
  visible,
  mode,
  topLevel,
  initial,
  onClose,
  onSubmit,
  onDelete,
}: {
  visible: boolean;
  mode: 'create' | 'edit';
  topLevel: Category[];
  initial?: Partial<Category>;
  onClose: () => void;
  onSubmit: (input: { name: string; icon: string; parentId: string | null }) => void;
  onDelete?: () => void;
}) {
  const themeColors = useThemeColors();
  const initialIcon = initial?.icon ?? (initial?.parentId ? '' : DEFAULT_CATEGORY_EMOJIS[0]);
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initialIcon);
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? null);

  useEffect(() => {
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? (initial?.parentId ? '' : DEFAULT_CATEGORY_EMOJIS[0]));
    setParentId(initial?.parentId ?? null);
  }, [initial, visible]);

  const canSave = name.trim().length > 0;
  const isSubcategory = parentId !== null;

  const handleDelete = () => {
    if (!onDelete) return;
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
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background">
        <SettingsHeader
          className="px-5 pt-5 pb-2"
          title={
            mode === 'create'
              ? I18n.t('categories.new_category')
              : I18n.t('categories.edit_category')
          }
          onClose={onClose}
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
        <ScrollView
          contentContainerStyle={CATEGORY_EDITOR_SCROLL_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4">
            <Input label={I18n.t('categories.name')} value={name} onChangeText={setName} />
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('categories.emoji')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {isSubcategory ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setIcon('');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('categories.none')}
                    accessibilityState={{ selected: icon.trim().length === 0 }}
                    className={cn(
                      'h-11 px-3 rounded-full border items-center justify-center',
                      icon.trim().length === 0
                        ? 'bg-primary/15 border-primary/50'
                        : 'bg-card border-border/40',
                    )}
                  >
                    <Text
                      variant="caption"
                      className={cn(
                        icon.trim().length === 0 ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {I18n.t('categories.none')}
                    </Text>
                  </Pressable>
                ) : null}
                {DEFAULT_CATEGORY_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setIcon(emoji);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${I18n.t('categories.emoji')} ${emoji}`}
                    accessibilityState={{ selected: icon === emoji }}
                    className={cn(
                      'h-11 w-11 rounded-full border items-center justify-center',
                      icon === emoji
                        ? 'bg-primary/15 border-primary/50'
                        : 'bg-card border-border/40',
                    )}
                  >
                    <Text className={cn(icon === emoji ? '' : 'opacity-80')}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('categories.parent_optional')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setParentId(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('categories.none')}
                  accessibilityState={{ selected: !parentId }}
                  className={cn(
                    'px-4 py-2.5 rounded-full border',
                    !parentId ? 'bg-primary/15 border-primary/50' : 'bg-card border-border/40',
                  )}
                >
                  <Text
                    variant="caption"
                    className={cn(!parentId ? 'text-primary' : 'text-muted-foreground')}
                  >
                    {I18n.t('categories.none')}
                  </Text>
                </Pressable>
                {topLevel.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setParentId(item.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected: parentId === item.id }}
                    className={cn(
                      'px-4 py-2.5 rounded-full border',
                      parentId === item.id
                        ? 'bg-primary/15 border-primary/50'
                        : 'bg-card border-border/40',
                    )}
                  >
                    <Text
                      variant="caption"
                      className={cn(
                        parentId === item.id ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {item.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
        <SettingsActionBar
          onCancel={onClose}
          onSave={() => {
            if (!canSave) return;
            const normalizedIcon = icon.trim();
            onSubmit({
              name: name.trim(),
              icon: parentId ? normalizedIcon : normalizedIcon || DEFAULT_CATEGORY_EMOJIS[0],
              parentId,
            });
          }}
          saveDisabled={!canSave}
        />
      </SafeAreaView>
    </ThemeModal>
  );
}

type CategoryRowThemeColors = {
  border: string;
  card: string;
  primary: string;
  primaryMuted: string;
  primarySoft: string;
  textMuted: string;
  text: string;
};

interface CategoryRowBaseProps {
  item: Category;
  themeColors: CategoryRowThemeColors;
  rowWidth: number;
}

function DragHandleButton({
  backgroundColor,
  borderColor,
  iconColor,
  label,
}: {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  label: string;
}) {
  return (
    <Sortable.Handle>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.rowActionButton,
          {
            backgroundColor,
            borderColor,
          },
        ]}
      >
        <GripVertical size={14} color={iconColor} />
      </View>
    </Sortable.Handle>
  );
}

function TopLevelRow({
  item,
  themeColors,
  rowWidth,
  subtitle,
  onEdit,
  onNavigate,
}: CategoryRowBaseProps & {
  subtitle: string;
  onEdit: (item: Category) => void;
  onNavigate: (item: Category) => void;
}) {
  const tc = themeColors;
  return (
    <View
      style={[
        styles.rowContainer,
        { width: rowWidth },
        {
          borderColor: tc.border,
          backgroundColor: tc.card,
        },
      ]}
    >
      <View
        style={[
          styles.rowIconContainer,
          {
            backgroundColor: tc.primarySoft,
            borderColor: tc.primaryMuted,
          },
        ]}
      >
        <Text style={styles.rowIconText}>{resolveCategoryIcon(item.icon)}</Text>
      </View>
      <Pressable
        onPress={() => onNavigate(item)}
        style={styles.rowPrimaryPressable}
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        <View style={styles.rowTextStack}>
          <Text style={[styles.rowTitle, { color: tc.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text
            style={[styles.rowSubtitle, { color: tc.textMuted }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => onEdit(item)}
        hitSlop={4}
        style={[
          styles.rowActionButton,
          {
            backgroundColor: tc.primarySoft,
            borderColor: tc.primaryMuted,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.edit')}
      >
        <Pencil size={13} color={tc.primary} />
      </Pressable>
      <DragHandleButton
        backgroundColor={tc.primarySoft}
        borderColor={tc.primaryMuted}
        iconColor={tc.textMuted}
        label={`${I18n.t('common.reorder')} ${item.name}`}
      />
    </View>
  );
}

function SubcategoryRow({
  item,
  themeColors,
  rowWidth,
  parentIcon,
  onEdit,
}: CategoryRowBaseProps & {
  parentIcon: string | null;
  onEdit: (item: Category) => void;
}) {
  const tc = themeColors;
  const displayIcon = resolveCategoryIcon(item.icon, parentIcon);
  return (
    <View
      style={[
        styles.rowContainer,
        { width: rowWidth },
        {
          borderColor: tc.border,
          backgroundColor: tc.card,
        },
      ]}
    >
      <View
        style={[
          styles.rowIconContainer,
          {
            backgroundColor: tc.primarySoft,
            borderColor: tc.primaryMuted,
          },
        ]}
      >
        <Text style={styles.rowIconText}>{displayIcon}</Text>
      </View>
      <Text style={[styles.rowTitle, styles.rowPrimaryPressable, { color: tc.text }]}>
        {item.name}
      </Text>
      <Pressable
        onPress={() => onEdit(item)}
        hitSlop={4}
        style={[
          styles.rowActionButton,
          {
            backgroundColor: tc.primarySoft,
            borderColor: tc.primaryMuted,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.edit')}
      >
        <Pencil size={13} color={tc.primary} />
      </Pressable>
      <DragHandleButton
        backgroundColor={tc.primarySoft}
        borderColor={tc.primaryMuted}
        iconColor={tc.textMuted}
        label={`${I18n.t('common.reorder')} ${item.name}`}
      />
    </View>
  );
}

interface CategoriesScreenProps {
  onBack?: () => void;
  parentId?: string | null;
  onOpenParent?: (parentId: string) => void;
  useNativeBackGesture?: boolean;
}

export function CategoriesScreen({
  onBack,
  parentId = null,
  onOpenParent,
  useNativeBackGesture = false,
}: CategoriesScreenProps = {}) {
  const { categories, createCategory, updateCategory, deleteCategory, reorderCategories } =
    useApp();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const topLevelCategoryCount = useMemo(
    () => categories.filter((c) => !c.parentId).length,
    [categories],
  );
  const { contentWidth: windowWidth } = useDeviceLayout();
  const [type, setType] = useState<CategoryType>('expense');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const activeParentId = parentId ?? selectedParentId;
  const topLevelScrollRef = useAnimatedRef<ElementRef<typeof Animated.ScrollView>>();
  const subcategoriesScrollRef = useAnimatedRef<ElementRef<typeof Animated.ScrollView>>();
  const rowWidth = Math.max(windowWidth - SETTINGS_HORIZONTAL_PADDING * 2, 0);

  const { topLevel, childrenByParent, iconById } = useMemo(() => {
    const nextTopLevel: Category[] = [];
    const nextChildrenByParent = new Map<string, Category[]>();
    const nextIconById = new Map<string, string>();

    categories.forEach((category) => {
      if (category.type !== type) return;
      nextIconById.set(category.id, category.icon);
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
      iconById: nextIconById,
    };
  }, [categories, type]);
  const topLevelById = useMemo(
    () => new Map(topLevel.map((category) => [category.id, category])),
    [topLevel],
  );

  const selectedParent = activeParentId ? (topLevelById.get(activeParentId) ?? null) : null;
  const subcategoriesFromContext = useMemo(
    () => (activeParentId ? (childrenByParent.get(activeParentId) ?? []) : []),
    [activeParentId, childrenByParent],
  );

  useEffect(() => {
    if (!activeParentId) return;
    if (topLevelById.has(activeParentId)) return;
    if (parentId) {
      onBack?.();
      return;
    }
    setSelectedParentId(null);
  }, [activeParentId, onBack, parentId, topLevelById]);

  const rowThemeColors = useMemo<CategoryRowThemeColors>(
    () => ({
      border: withColorAlpha(themeColors.primary, 0.18),
      card: themeColors.card,
      primary: themeColors.primary,
      primaryMuted: themeColors.primaryMuted,
      primarySoft: themeColors.primarySoft,
      textMuted: themeColors.textMuted,
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
  const topLevelSubtitleById = useMemo(() => {
    const subtitles = new Map<string, string>();
    topLevel.forEach((parent) => {
      const children = childrenByParent.get(parent.id);
      if (!children || children.length === 0) {
        subtitles.set(parent.id, I18n.t('categories.no_subcategories'));
        return;
      }
      let subtitle = '';
      children.forEach((child) => {
        const trimmedName = child.name.trim();
        if (!trimmedName) return;
        subtitle = subtitle ? `${subtitle} · ${trimmedName}` : trimmedName;
      });
      subtitles.set(parent.id, subtitle || I18n.t('categories.no_subcategories'));
    });
    return subtitles;
  }, [childrenByParent, topLevel]);
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
  const handleEdit = useCallback((item: Category) => {
    void triggerHaptic('selection');
    setEditing(item);
  }, []);
  const handleNavigate = useCallback(
    (item: Category) => {
      void triggerHaptic('selection');
      if (onOpenParent) {
        onOpenParent(item.id);
        return;
      }
      setSelectedParentId(item.id);
    },
    [onOpenParent],
  );

  const handleSubcategoryBack = useCallback(() => {
    if (parentId) {
      onBack?.();
      return;
    }
    setSelectedParentId(null);
  }, [onBack, parentId]);

  const edgeSwipeBackHandler = useMemo(() => {
    if (selectedParent) return handleSubcategoryBack;
    return onBack;
  }, [handleSubcategoryBack, onBack, selectedParent]);

  if (selectedParent) {
    const content = (
      <SettingsPageLayout>
        <View style={styles.headerContainer}>
          <SettingsHeader
            className="px-0 pt-5 pb-1"
            onBack={handleSubcategoryBack}
            title={selectedParent.name}
            rightAccessory={
              <Button
                size="icon"
                haptic="none"
                onPress={() => {
                  void triggerHaptic('selection');
                  setCreateOpen(true);
                }}
              >
                <Plus size={18} color="#fff" />
              </Button>
            }
          />
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.listContainer}>
          <Animated.ScrollView
            ref={subcategoriesScrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={CATEGORY_LIST_CONTENT_STYLE}
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
                const orderedSubcategories = order(subcategoriesFromContext);
                reorderCategories(
                  buildOrderedCategoryIds({
                    reorderedChildren: {
                      items: orderedSubcategories,
                      parentId: selectedParent.id,
                    },
                  }),
                );
                void triggerHaptic('selection');
              }}
              scrollableRef={subcategoriesScrollRef}
              width="fill"
            >
              {subcategoriesFromContext.map((item) => (
                <SubcategoryRow
                  key={item.id}
                  item={item}
                  themeColors={rowThemeColors}
                  rowWidth={rowWidth}
                  parentIcon={item.parentId ? (iconById.get(item.parentId) ?? null) : null}
                  onEdit={handleEdit}
                />
              ))}
            </Sortable.Flex>
          </Animated.ScrollView>
        </View>

        <CategoryEditor
          visible={createOpen}
          mode="create"
          topLevel={topLevel}
          initial={{ parentId: activeParentId, type }}
          onClose={() => setCreateOpen(false)}
          onSubmit={(input) => {
            createCategory({ ...input, type, isDefault: false });
            setCreateOpen(false);
          }}
        />
        <CategoryEditor
          visible={!!editing}
          mode="edit"
          topLevel={topLevel}
          initial={editing ?? undefined}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            if (!editing) return;
            updateCategory(editing.id, input);
            setEditing(null);
          }}
          onDelete={() => {
            if (!editing) return;
            deleteCategory(editing.id);
            setEditing(null);
          }}
        />
      </SettingsPageLayout>
    );
    if (useNativeBackGesture) return content;
    return (
      <EdgeSwipeBackContainer onBack={handleSubcategoryBack}>{content}</EdgeSwipeBackContainer>
    );
  }

  const content = (
    <SettingsPageLayout>
      <View style={styles.headerContainer}>
        <SettingsHeader
          className="px-0 pt-5 pb-1"
          onBack={onBack}
          title={I18n.t('settings.categories')}
          subtitle={I18n.t('settings.categories_subtitle')}
          rightAccessory={
            <Button
              size="icon"
              haptic="none"
              onPress={() => {
                if (!checkLimit('categories', topLevelCategoryCount)) return;
                void triggerHaptic('selection');
                setCreateOpen(true);
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
          ref={topLevelScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={CATEGORY_LIST_CONTENT_STYLE}
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
            scrollableRef={topLevelScrollRef}
            width="fill"
          >
            {topLevel.map((item) => (
              <TopLevelRow
                key={item.id}
                item={item}
                themeColors={rowThemeColors}
                rowWidth={rowWidth}
                subtitle={
                  topLevelSubtitleById.get(item.id) ?? I18n.t('categories.no_subcategories')
                }
                onEdit={handleEdit}
                onNavigate={handleNavigate}
              />
            ))}
          </Sortable.Flex>
        </Animated.ScrollView>
      </View>

      <CategoryEditor
        visible={createOpen}
        mode="create"
        topLevel={topLevel}
        initial={{ type }}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => {
          createCategory({ ...input, type, isDefault: false });
          setCreateOpen(false);
        }}
      />
      <CategoryEditor
        visible={!!editing}
        mode="edit"
        topLevel={topLevel}
        initial={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSubmit={(input) => {
          if (!editing) return;
          updateCategory(editing.id, input);
          setEditing(null);
        }}
        onDelete={() => {
          if (!editing) return;
          deleteCategory(editing.id);
          setEditing(null);
        }}
      />
    </SettingsPageLayout>
  );
  if (useNativeBackGesture) return content;
  return <EdgeSwipeBackContainer onBack={edgeSwipeBackHandler}>{content}</EdgeSwipeBackContainer>;
}
