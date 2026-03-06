import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  SettingsSection,
  Text,
  ThemeModal,
} from '~/components/ui';
import { DEFAULT_CATEGORY_EMOJIS } from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useDebouncedPersistence } from '~/hooks/useDebouncedPersistence';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';

const SNAP_CONFIG = {
  damping: 100,
  stiffness: 800,
  mass: 0.2,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};
const DRAGGABLE_LIST_BACK_SWIPE_GUARD = { left: -28 } as const;
const DRAGGABLE_LIST_ACTIVATION_DISTANCE = 12;
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
    paddingVertical: spacing.xs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    marginBottom: spacing.xxs,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
  },
  rowContainerActive: {
    opacity: 0.9,
  },
  rowIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconText: {
    fontSize: 12,
  },
  rowPrimaryPressable: {
    flex: 1,
  },
  rowTextStack: {
    gap: spacing.xxs,
  },
  rowTitle: {
    fontSize: 13,
  },
  rowSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  rowActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDragButton: {
    minWidth: 40,
    minHeight: 40,
    padding: spacing.xs,
    marginRight: -2,
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

function CategoryEditor({
  visible,
  mode,
  topLevel,
  initial,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  mode: 'create' | 'edit';
  topLevel: Category[];
  initial?: Partial<Category>;
  onClose: () => void;
  onSubmit: (input: { name: string; icon: string; parentId: string | null }) => void;
}) {
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

            {mode === 'edit' ? (
              <SettingsSection className="mt-2" title={I18n.t('settings.danger_zone')} danger>
                <Pressable
                  onPress={() => {
                    void triggerHaptic('warning');
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.delete')}
                  className="self-start rounded-full border border-destructive/30 bg-destructive/8 px-3 py-2"
                >
                  <Text variant="caption" className="text-destructive">
                    {I18n.t('common.delete')}
                  </Text>
                </Pressable>
              </SettingsSection>
            ) : null}
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
  surface: string;
  surfaceMuted: string;
  textMuted: string;
  coral: string;
  text: string;
};

function TopLevelRow({
  item,
  drag,
  isActive,
  themeColors,
  subtitle,
  onEdit,
  onDelete,
  onNavigate,
}: RenderItemParams<Category> & {
  themeColors: CategoryRowThemeColors;
  subtitle: string;
  onEdit: (item: Category) => void;
  onDelete: (item: Category) => void;
  onNavigate: (item: Category) => void;
}) {
  const tc = themeColors;
  return (
    <View
      style={[
        styles.rowContainer,
        isActive ? styles.rowContainerActive : null,
        {
          borderColor: isActive ? tc.textMuted : 'rgba(0,0,0,0.08)',
          backgroundColor: isActive ? tc.surfaceMuted : tc.surface,
        },
      ]}
    >
      <View style={styles.rowIconContainer}>
        <Text style={styles.rowIconText}>{resolveCategoryIcon(item.icon)}</Text>
      </View>
      <Pressable
        onPress={() => onNavigate(item)}
        disabled={isActive}
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
        disabled={isActive}
        hitSlop={4}
        style={[styles.rowActionButton, { backgroundColor: 'rgba(0,0,0,0.05)' }]}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.edit')}
      >
        <Pencil size={11} color={tc.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => onDelete(item)}
        disabled={isActive}
        hitSlop={4}
        style={[styles.rowActionButton, { backgroundColor: 'rgba(255,0,0,0.06)' }]}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.delete')}
      >
        <Trash2 size={11} color={tc.coral} />
      </Pressable>
      <Pressable
        onLongPress={drag}
        delayLongPress={100}
        disabled={isActive}
        hitSlop={8}
        style={styles.rowDragButton}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('categories.reorder')}
      >
        <GripVertical size={16} color={tc.textMuted} />
      </Pressable>
    </View>
  );
}

function SubcategoryRow({
  item,
  drag,
  isActive,
  themeColors,
  parentIcon,
  onEdit,
  onDelete,
}: RenderItemParams<Category> & {
  themeColors: CategoryRowThemeColors;
  parentIcon: string | null;
  onEdit: (item: Category) => void;
  onDelete: (item: Category) => void;
}) {
  const tc = themeColors;
  const displayIcon = resolveCategoryIcon(item.icon, parentIcon);
  return (
    <View
      style={[
        styles.rowContainer,
        isActive ? styles.rowContainerActive : null,
        {
          borderColor: isActive ? tc.textMuted : 'rgba(0,0,0,0.08)',
          backgroundColor: isActive ? tc.surfaceMuted : tc.surface,
        },
      ]}
    >
      <View style={styles.rowIconContainer}>
        <Text style={styles.rowIconText}>{displayIcon}</Text>
      </View>
      <Text style={[styles.rowTitle, styles.rowPrimaryPressable, { color: tc.text }]}>
        {item.name}
      </Text>
      <Pressable
        onPress={() => onEdit(item)}
        disabled={isActive}
        hitSlop={4}
        style={[styles.rowActionButton, { backgroundColor: 'rgba(0,0,0,0.05)' }]}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.edit')}
      >
        <Pencil size={11} color={tc.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => onDelete(item)}
        disabled={isActive}
        hitSlop={4}
        style={[styles.rowActionButton, { backgroundColor: 'rgba(255,0,0,0.06)' }]}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.delete')}
      >
        <Trash2 size={11} color={tc.coral} />
      </Pressable>
      <Pressable
        onLongPress={drag}
        delayLongPress={100}
        disabled={isActive}
        hitSlop={8}
        style={styles.rowDragButton}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('categories.reorder')}
      >
        <GripVertical size={16} color={tc.textMuted} />
      </Pressable>
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
  const { persistOrder } = useDebouncedPersistence(500);
  const themeColors = useThemeColors();
  const [type, setType] = useState<CategoryType>('expense');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const activeParentId = parentId ?? selectedParentId;

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

  const [localTopLevel, setLocalTopLevel] = useState(topLevel);
  const [localSubcategories, setLocalSubcategories] = useState(subcategoriesFromContext);
  const [isReordering, setIsReordering] = useState(false);
  const skipNextTopLevelSyncRef = useRef(false);
  const skipNextSubcategorySyncRef = useRef(false);

  useEffect(() => {
    skipNextTopLevelSyncRef.current = false;
    skipNextSubcategorySyncRef.current = false;
    setIsReordering(false);
    setLocalTopLevel(topLevel);
    setLocalSubcategories(subcategoriesFromContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on tab change only; topLevel/subcategories derive from type
  }, [type]);
  useEffect(() => {
    if (isReordering) return;
    if (skipNextTopLevelSyncRef.current) {
      skipNextTopLevelSyncRef.current = false;
      return;
    }
    setLocalTopLevel(topLevel);
  }, [isReordering, topLevel]);
  useEffect(() => {
    if (isReordering) return;
    if (skipNextSubcategorySyncRef.current) {
      skipNextSubcategorySyncRef.current = false;
      return;
    }
    setLocalSubcategories(subcategoriesFromContext);
  }, [isReordering, subcategoriesFromContext]);
  useEffect(() => {
    if (!activeParentId) return;
    if (topLevelById.has(activeParentId)) return;
    if (parentId) {
      onBack?.();
      return;
    }
    setSelectedParentId(null);
  }, [activeParentId, onBack, parentId, topLevelById]);
  useEffect(() => {
    setIsReordering(false);
  }, [activeParentId]);

  const rowThemeColors = useMemo<CategoryRowThemeColors>(
    () => ({
      surface: themeColors.surface,
      surfaceMuted: themeColors.surfaceMuted,
      textMuted: themeColors.textMuted,
      coral: themeColors.coral,
      text: themeColors.text,
    }),
    [
      themeColors.coral,
      themeColors.surface,
      themeColors.surfaceMuted,
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
  const handleEdit = useCallback((item: Category) => {
    void triggerHaptic('selection');
    setEditing(item);
  }, []);
  const handleDelete = useCallback(
    (item: Category) => {
      void triggerHaptic('warning');
      deleteCategory(item.id);
    },
    [deleteCategory],
  );
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
  const renderTopLevelRow = useCallback(
    (params: RenderItemParams<Category>) => (
      <TopLevelRow
        {...params}
        themeColors={rowThemeColors}
        subtitle={topLevelSubtitleById.get(params.item.id) ?? I18n.t('categories.no_subcategories')}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onNavigate={handleNavigate}
      />
    ),
    [handleDelete, handleEdit, handleNavigate, rowThemeColors, topLevelSubtitleById],
  );
  const renderSubcategoryRow = useCallback(
    (params: RenderItemParams<Category>) => (
      <SubcategoryRow
        {...params}
        themeColors={rowThemeColors}
        parentIcon={params.item.parentId ? (iconById.get(params.item.parentId) ?? null) : null}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    ),
    [handleDelete, handleEdit, iconById, rowThemeColors],
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
          <DraggableFlatList
            data={localSubcategories}
            keyExtractor={(item) => item.id}
            renderItem={renderSubcategoryRow}
            dragHitSlop={DRAGGABLE_LIST_BACK_SWIPE_GUARD}
            activationDistance={DRAGGABLE_LIST_ACTIVATION_DISTANCE}
            animationConfig={SNAP_CONFIG}
            onDragBegin={() => {
              setIsReordering(true);
              void triggerHaptic('medium');
            }}
            onRelease={() => {
              setIsReordering(false);
            }}
            onDragEnd={({ data }) => {
              setIsReordering(false);
              void triggerHaptic('light');
              skipNextSubcategorySyncRef.current = true;
              setLocalSubcategories(data);
              const orderedIds = data.map((item) => item.id);
              persistOrder('categories', orderedIds);
              reorderCategories(orderedIds);
            }}
            autoscrollThreshold={80}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={CATEGORY_LIST_CONTENT_STYLE}
          />
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
        <DraggableFlatList
          data={localTopLevel}
          keyExtractor={(item) => item.id}
          renderItem={renderTopLevelRow}
          dragHitSlop={DRAGGABLE_LIST_BACK_SWIPE_GUARD}
          activationDistance={DRAGGABLE_LIST_ACTIVATION_DISTANCE}
          animationConfig={SNAP_CONFIG}
          onDragBegin={() => {
            setIsReordering(true);
            void triggerHaptic('medium');
          }}
          onRelease={() => {
            setIsReordering(false);
          }}
          onDragEnd={({ data }) => {
            setIsReordering(false);
            void triggerHaptic('light');
            skipNextTopLevelSyncRef.current = true;
            setLocalTopLevel(data);
            const orderedIds = data.map((item) => item.id);
            persistOrder('categories', orderedIds);
            reorderCategories(orderedIds);
          }}
          autoscrollThreshold={80}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={CATEGORY_LIST_CONTENT_STYLE}
        />
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
      />
    </SettingsPageLayout>
  );
  if (useNativeBackGesture) return content;
  return <EdgeSwipeBackContainer onBack={edgeSwipeBackHandler}>{content}</EdgeSwipeBackContainer>;
}
