import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GripVertical, Plus } from 'lucide-react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';

import { ThemeModal } from '~/components/ui/theme-modal';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { Card, CardContent } from '~/components/ui/card';
import { Button } from '~/components/ui/button';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
} from '~/components/ui/settings';
import { SegmentedToggle } from '~/components/ui/toggle';
import { useApp } from '~/context/AppContext';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_EMOJIS } from '~/constants/appDefaults';
import type { Category, CategoryType } from '~/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';
import { triggerHaptic } from '~/services/haptics';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { I18n } from '~/lib/i18n';

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
  onSubmit: (input: { name: string; icon: string; color: string; parentId: string | null }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_CATEGORY_EMOJIS[0]);
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? null);

  React.useEffect(() => {
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? DEFAULT_CATEGORY_EMOJIS[0]);
    setColor(initial?.color ?? CATEGORY_COLORS[0]);
    setParentId(initial?.parentId ?? null);
  }, [initial, visible]);
  const canSave = name.trim().length > 0;

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end" pointerEvents="box-none">
        <Pressable className="absolute inset-0 bg-black/20" onPress={onClose} />
        <SafeAreaView
          className="rounded-t-[28px] border-t border-border/40 bg-background"
          edges={['bottom']}
        >
          <View className="items-center pt-3">
            <View className="h-1.5 w-11 rounded-full bg-border/70" />
          </View>
          <SettingsHeader
            className="px-5 pt-3 pb-2"
            title={
              mode === 'create'
                ? I18n.t('categories.new_category')
                : I18n.t('categories.edit_category')
            }
            onClose={onClose}
          />

          <ScrollView
            className="max-h-[620px]"
            contentContainerStyle={{
              paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
              paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View className="gap-4">
              <Input label={I18n.t('categories.name')} value={name} onChangeText={setName} />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Input label={I18n.t('categories.color')} value={color} onChangeText={setColor} />
                </View>
              </View>

              <View>
                <Text variant="label" tone="muted" className="mb-2">
                  {I18n.t('categories.emoji')}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {DEFAULT_CATEGORY_EMOJIS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      onPress={() => {
                        void triggerHaptic('selection');
                        setIcon(emoji);
                      }}
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
              onSubmit({
                name: name.trim(),
                icon: icon || DEFAULT_CATEGORY_EMOJIS[0],
                color: color || CATEGORY_COLORS[0],
                parentId,
              });
            }}
            saveDisabled={!canSave}
          />
        </SafeAreaView>
      </View>
    </ThemeModal>
  );
}

interface CategoriesScreenProps {
  onBack?: () => void;
}

export function CategoriesScreen({ onBack }: CategoriesScreenProps = {}) {
  const themeColors = useThemeColors();
  const { categories, createCategory, updateCategory, deleteCategory, reorderCategories } =
    useApp();
  const swipeBackHandlers = useEdgeSwipeBack(onBack);

  const [type, setType] = useState<CategoryType>('expense');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderTopLevelIds, setReorderTopLevelIds] = useState<string[]>([]);
  const [reorderChildrenByParent, setReorderChildrenByParent] = useState<Record<string, string[]>>(
    {},
  );
  const [reorderScope, setReorderScope] = useState<string>('__top__');

  const typeCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );

  const topLevel = useMemo(
    () => typeCategories.filter((category) => !category.parentId),
    [typeCategories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, typeof typeCategories>();
    typeCategories
      .filter((item) => !!item.parentId)
      .forEach((item) => {
        const key = item.parentId as string;
        if (!map.has(key)) {
          map.set(key, []);
        }
        map.get(key)?.push(item);
      });
    return map;
  }, [typeCategories]);

  const resetReorderState = useCallback(() => {
    const nextTopLevelIds = topLevel.map((item) => item.id);
    const nextChildrenByParent: Record<string, string[]> = {};
    topLevel.forEach((parent) => {
      nextChildrenByParent[parent.id] = (childrenByParent.get(parent.id) ?? []).map(
        (child) => child.id,
      );
    });
    setReorderTopLevelIds(nextTopLevelIds);
    setReorderChildrenByParent(nextChildrenByParent);
    setReorderScope('__top__');
  }, [childrenByParent, topLevel]);

  const startReorder = () => {
    resetReorderState();
    setIsReordering(true);
  };

  useEffect(() => {
    if (!isReordering) return;
    resetReorderState();
  }, [isReordering, resetReorderState]);

  const categoryById = useMemo(
    () => new Map(typeCategories.map((item) => [item.id, item])),
    [typeCategories],
  );
  const reorderScopeItems = useMemo(() => {
    if (reorderScope === '__top__') {
      return reorderTopLevelIds
        .map((id) => categoryById.get(id))
        .filter((item): item is Category => !!item);
    }
    return (reorderChildrenByParent[reorderScope] ?? [])
      .map((id) => categoryById.get(id))
      .filter((item): item is Category => !!item);
  }, [categoryById, reorderChildrenByParent, reorderScope, reorderTopLevelIds]);

  const reorderScopeOptions = useMemo(() => {
    return [
      { value: '__top__', label: 'Top-level' },
      ...topLevel
        .filter((parent) => (childrenByParent.get(parent.id)?.length ?? 0) > 0)
        .map((parent) => ({ value: parent.id, label: parent.name })),
    ];
  }, [childrenByParent, topLevel]);

  const saveReorder = () => {
    let nextAllIds = categories.map((item) => item.id);
    const applyGroup = (orderedIds: string[]) => {
      if (orderedIds.length === 0) return;
      const groupSet = new Set(orderedIds);
      const positions = nextAllIds
        .map((id, index) => (groupSet.has(id) ? index : -1))
        .filter((index) => index >= 0);
      positions.forEach((position, index) => {
        nextAllIds[position] = orderedIds[index]!;
      });
    };

    applyGroup(reorderTopLevelIds);
    Object.values(reorderChildrenByParent).forEach((orderedIds) => applyGroup(orderedIds));
    reorderCategories(nextAllIds);
    setIsReordering(false);
  };

  return (
    <SettingsPageLayout
      swipeBackHandlers={swipeBackHandlers}
      actionBar={
        isReordering ? (
          <SettingsActionBar onCancel={() => setIsReordering(false)} onSave={saveReorder} />
        ) : undefined
      }
    >
      {isReordering ? (
        <DraggableFlatList
          data={reorderScopeItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
          }}
          activationDistance={12}
          autoscrollThreshold={80}
          autoscrollSpeed={180}
          onDragEnd={({ data }) => {
            const nextIds = data.map((item) => item.id);
            if (reorderScope === '__top__') {
              setReorderTopLevelIds(nextIds);
              return;
            }
            setReorderChildrenByParent((prev) => ({ ...prev, [reorderScope]: nextIds }));
          }}
          ListHeaderComponent={
            <View className="pb-3 gap-4">
              <SettingsHeader
                className="px-0 pt-5 pb-1"
                onBack={onBack}
                title={I18n.t('categories.reorder_title')}
                subtitle={I18n.t('categories.reorder_subtitle')}
              />

              <SegmentedToggle
                options={[
                  { value: 'expense', label: I18n.t('nav.expense') },
                  { value: 'income', label: I18n.t('nav.income') },
                ]}
                value={type}
                onChange={(val) => setType(val as CategoryType)}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingRight: 12 }}
              >
                {reorderScopeOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setReorderScope(option.value);
                    }}
                    className={cn(
                      'px-3.5 py-2 rounded-full border',
                      reorderScope === option.value
                        ? 'bg-primary/15 border-primary/50'
                        : 'bg-card border-border/35',
                    )}
                  >
                    <Text
                      variant="label"
                      className={cn(
                        reorderScope === option.value ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          }
          renderItem={({ item, drag, isActive }: RenderItemParams<Category>) => (
            <Pressable
              onLongPress={() => {
                void triggerHaptic('medium');
                drag();
              }}
              disabled={isActive}
              className="mb-2.5"
            >
              <Card className={isActive ? 'opacity-85' : undefined}>
                <CardContent className="py-3.5 flex-row items-center gap-3">
                  <GripVertical size={16} color={themeColors.textMuted} />
                  <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                  <Text variant="caption" className="flex-1">
                    {item.name}
                  </Text>
                </CardContent>
              </Card>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={topLevel}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
          }}
          ListHeaderComponent={
            <View className="pb-3 gap-4">
              <SettingsHeader
                className="px-0 pt-5 pb-1"
                onBack={onBack}
                title={I18n.t('categories.title')}
                subtitle={I18n.t('categories.subtitle')}
                rightAccessory={
                  <View className="flex-row items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={startReorder}
                      className="h-9 px-3"
                    >
                      <Text>{I18n.t('categories.reorder')}</Text>
                    </Button>
                    <Button size="icon" onPress={() => setCreateOpen(true)}>
                      <Plus size={18} color="#fff" />
                    </Button>
                  </View>
                }
              />

              <SegmentedToggle
                options={[
                  { value: 'expense', label: I18n.t('nav.expense') },
                  { value: 'income', label: I18n.t('nav.income') },
                ]}
                value={type}
                onChange={(val) => setType(val as CategoryType)}
              />
            </View>
          }
          renderItem={({ item, index }) => {
            const children = childrenByParent.get(item.id) ?? [];

            return (
              <Animated.View entering={FadeIn.delay(index * 50).duration(300)}>
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setEditing(item);
                  }}
                  className="mb-2.5"
                >
                  <Card>
                    <CardContent className="py-4 gap-2.5">
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-3">
                          <View className="w-10 h-10 rounded-full bg-primary/8 items-center justify-center">
                            <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                          </View>
                          <View>
                            <Text variant="caption" className="text-foreground">
                              {item.name}
                            </Text>
                            <Text variant="label" tone="muted" className="mt-0.5">
                              {I18n.t('categories.subcategories_count', { count: children.length })}
                            </Text>
                          </View>
                        </View>
                        {!item.isDefault ? (
                          <Pressable
                            onPress={() => {
                              void triggerHaptic('warning');
                              deleteCategory(item.id);
                            }}
                            className="px-3 py-1.5"
                          >
                            <Text variant="caption" style={{ color: themeColors.coral }}>
                              {I18n.t('common.delete')}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>

                      {children.length > 0 ? (
                        <View className="pt-2 border-t border-border/30 gap-2">
                          {children.map((child) => (
                            <View
                              key={child.id}
                              className="flex-row items-center justify-between pl-2"
                            >
                              <View className="flex-row items-center gap-2">
                                <Text style={{ fontSize: 14 }}>{child.icon}</Text>
                                <Text variant="caption" tone="muted">
                                  {child.name}
                                </Text>
                              </View>
                              {!child.isDefault ? (
                                <Pressable
                                  onPress={() => {
                                    void triggerHaptic('warning');
                                    deleteCategory(child.id);
                                  }}
                                  className="px-2 py-1"
                                >
                                  <Text variant="label" style={{ color: themeColors.coral }}>
                                    {I18n.t('common.delete')}
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </CardContent>
                  </Card>
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}

      <CategoryEditor
        visible={createOpen}
        mode="create"
        topLevel={topLevel}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => {
          createCategory({ ...input, type, isDefault: false });
          setCreateOpen(false);
        }}
      />

      <CategoryEditor
        visible={!!editing}
        mode="edit"
        topLevel={topLevel.filter((item) => item.id !== editing?.id)}
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
}
