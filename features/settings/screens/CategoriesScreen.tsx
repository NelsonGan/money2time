import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';

import { ThemeModal } from '~/components/ui/theme-modal';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
} from '~/components/ui/settings';
import { SegmentedToggle } from '~/components/ui/toggle';
import { useApp } from '~/context/AppContext';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_EMOJIS } from '~/constants/appDefaults';
import type { Category, CategoryType } from '~/types';
import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';
import { triggerHaptic } from '~/services/haptics';
import { I18n } from '~/lib/i18n';
import { useDebouncedPersistence } from '~/hooks/useDebouncedPersistence';

const SNAP_CONFIG = {
  damping: 100,
  stiffness: 800,
  mass: 0.2,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

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
  const themeColors = useThemeColors();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? DEFAULT_CATEGORY_EMOJIS[0]);
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? null);

  useEffect(() => {
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? DEFAULT_CATEGORY_EMOJIS[0]);
    setColor(initial?.color ?? CATEGORY_COLORS[0]);
    setParentId(initial?.parentId ?? null);
  }, [initial, visible]);

  const canSave = name.trim().length > 0;

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
                      if (mode === 'create') {
                        setIcon(item.icon || DEFAULT_CATEGORY_EMOJIS[0]);
                      }
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

            {mode === 'edit' ? (
              <SettingsSection className="mt-2" title={I18n.t('settings.danger_zone')} danger>
                <Pressable
                  onPress={() => {
                    void triggerHaptic('warning');
                    onClose();
                  }}
                  className="self-start rounded-full border border-destructive/30 bg-destructive/8 px-3 py-2"
                >
                  <Text variant="caption" style={{ color: themeColors.coral }}>
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
    </ThemeModal>
  );
}

let _onEdit: ((item: Category) => void) | null = null;
let _onDelete: ((item: Category) => void) | null = null;
let _onNavigate: ((item: Category) => void) | null = null;
let _themeColors: { surface: string; surfaceMuted: string; textMuted: string; coral: string; text: string } | null = null;
let _hasChildren: ((id: string) => boolean) | null = null;

function TopLevelRow({ item, drag, isActive }: RenderItemParams<Category>) {
  const tc = _themeColors!;
  const hasKids = _hasChildren?.(item.id) ?? false;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingLeft: 10,
        paddingRight: 6,
        marginBottom: 4,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isActive ? tc.textMuted : 'rgba(0,0,0,0.08)',
        backgroundColor: isActive ? tc.surfaceMuted : tc.surface,
        gap: 6,
        opacity: isActive ? 0.9 : 1,
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: item.color || '#ddd', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12 }}>{item.icon}</Text>
      </View>
      <Pressable
        onPress={() => hasKids ? _onNavigate?.(item) : undefined}
        disabled={isActive || !hasKids}
        style={{ flex: 1 }}
      >
        <Text style={{ fontSize: 13, color: tc.text }}>{item.name}</Text>
      </Pressable>
      <Pressable
        onPress={() => _onEdit?.(item)}
        disabled={isActive}
        hitSlop={4}
        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Pencil size={11} color={tc.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => _onDelete?.(item)}
        disabled={isActive}
        hitSlop={4}
        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Trash2 size={11} color={tc.coral} />
      </Pressable>
      <Pressable
        onLongPress={drag}
        delayLongPress={100}
        disabled={isActive}
        hitSlop={8}
        style={{ padding: 6, marginRight: -2 }}
      >
        <GripVertical size={16} color={tc.textMuted} />
      </Pressable>
    </View>
  );
}

function SubcategoryRow({ item, drag, isActive }: RenderItemParams<Category>) {
  const tc = _themeColors!;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingLeft: 10,
        paddingRight: 6,
        marginBottom: 4,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isActive ? tc.textMuted : 'rgba(0,0,0,0.08)',
        backgroundColor: isActive ? tc.surfaceMuted : tc.surface,
        gap: 6,
        opacity: isActive ? 0.9 : 1,
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: item.color || '#ddd', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 12 }}>{item.icon}</Text>
      </View>
      <Text style={{ flex: 1, fontSize: 13, color: tc.text }}>{item.name}</Text>
      <Pressable
        onPress={() => _onEdit?.(item)}
        disabled={isActive}
        hitSlop={4}
        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Pencil size={11} color={tc.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => _onDelete?.(item)}
        disabled={isActive}
        hitSlop={4}
        style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
      >
        <Trash2 size={11} color={tc.coral} />
      </Pressable>
      <Pressable
        onLongPress={drag}
        delayLongPress={100}
        disabled={isActive}
        hitSlop={8}
        style={{ padding: 6, marginRight: -2 }}
      >
        <GripVertical size={16} color={tc.textMuted} />
      </Pressable>
    </View>
  );
}

interface CategoriesScreenProps {
  onBack?: () => void;
}

export function CategoriesScreen({ onBack }: CategoriesScreenProps = {}) {
  const { categories, createCategory, updateCategory, deleteCategory } = useApp();
  const { persistOrder } = useDebouncedPersistence(500);
  const themeColors = useThemeColors();
  const [type, setType] = useState<CategoryType>('expense');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  const typeCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );
  const topLevel = useMemo(
    () => typeCategories.filter((category) => !category.parentId),
    [typeCategories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    typeCategories
      .filter((item) => !!item.parentId)
      .forEach((item) => {
        const key = item.parentId as string;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      });
    return map;
  }, [typeCategories]);

  const selectedParent = selectedParentId
    ? (topLevel.find((c) => c.id === selectedParentId) ?? null)
    : null;
  const subcategoriesFromContext = useMemo(
    () => (selectedParentId ? (childrenByParent.get(selectedParentId) ?? []) : []),
    [childrenByParent, selectedParentId],
  );

  const [localTopLevel, setLocalTopLevel] = useState(topLevel);
  const [localSubcategories, setLocalSubcategories] = useState(subcategoriesFromContext);
  const didDragRef = useRef(false);

  useEffect(() => {
    if (didDragRef.current) { didDragRef.current = false; return; }
    setLocalTopLevel(topLevel);
  }, [topLevel]);
  useEffect(() => {
    if (didDragRef.current) { didDragRef.current = false; return; }
    setLocalSubcategories(subcategoriesFromContext);
  }, [subcategoriesFromContext]);
  useEffect(() => {
    if (selectedParentId && !topLevel.find((c) => c.id === selectedParentId)) {
      setSelectedParentId(null);
    }
  }, [selectedParentId, topLevel]);

  _themeColors = themeColors;
  _hasChildren = (id: string) => (childrenByParent.get(id)?.length ?? 0) > 0;
  _onEdit = (item: Category) => {
    void triggerHaptic('selection');
    setEditing(item);
  };
  _onDelete = (item: Category) => {
    void triggerHaptic('warning');
    deleteCategory(item.id);
  };
  _onNavigate = (item: Category) => {
    void triggerHaptic('selection');
    setSelectedParentId(item.id);
  };

  if (selectedParent) {
    return (
      <SettingsPageLayout>
        <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
          <SettingsHeader
            className="px-0 pt-5 pb-1"
            onBack={() => setSelectedParentId(null)}
            title={selectedParent.name}
            subtitle={I18n.t('categories.subcategories')}
            rightAccessory={
              <Button
                size="icon"
                onPress={() => {
                  void triggerHaptic('selection');
                  setCreateOpen(true);
                }}
              >
                <Plus size={18} color="#fff" />
              </Button>
            }
          />
          <View style={{ height: 8 }} />
        </View>

        <View style={{ flex: 1 }}>
        <DraggableFlatList
          data={localSubcategories}
          keyExtractor={(item) => item.id}
          renderItem={SubcategoryRow}
          animationConfig={SNAP_CONFIG}
          onDragBegin={() => void triggerHaptic('medium')}
          onDragEnd={({ data }) => {
            void triggerHaptic('light');
            didDragRef.current = true;
            setLocalSubcategories(data);
            persistOrder('categories', data.map((i) => i.id));
          }}
          onPlaceholderIndexChange={() => void triggerHaptic('selection')}
          autoscrollThreshold={80}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
          }}
        />
        </View>

        <CategoryEditor
          visible={createOpen}
          mode="create"
          topLevel={topLevel}
          initial={{ parentId: selectedParentId, type }}
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
  }

  return (
    <SettingsPageLayout>
      <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
        <SettingsHeader
          className="px-0 pt-5 pb-1"
          onBack={onBack}
          title={I18n.t('settings.categories')}
          subtitle={I18n.t('settings.categories_subtitle')}
          rightAccessory={
            <Button
              size="icon"
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
          onChange={(v) => setType(v as CategoryType)}
          options={[
            { value: 'expense', label: I18n.t('categories.expense') },
            { value: 'income', label: I18n.t('categories.income') },
          ]}
        />
        <View style={{ height: 8 }} />
      </View>

      <View style={{ flex: 1 }}>
      <DraggableFlatList
        data={localTopLevel}
        keyExtractor={(item) => item.id}
        renderItem={TopLevelRow}
        animationConfig={SNAP_CONFIG}
        onDragBegin={() => void triggerHaptic('medium')}
        onDragEnd={({ data }) => {
          void triggerHaptic('light');
          didDragRef.current = true;
          setLocalTopLevel(data);
          persistOrder('categories', data.map((i) => i.id));
        }}
        onPlaceholderIndexChange={() => void triggerHaptic('selection')}
        autoscrollThreshold={80}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
        }}
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
}
