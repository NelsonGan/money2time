import { AlertCircle, GripVertical } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';
import type { AnimatedRef } from 'react-native-reanimated';
import type Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { CategoryEmoji, SettingsActionBar, Text } from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { money } from '~/features/budget/lib/format';
import { useKeyboardHeight } from '~/hooks/useKeyboardHeight';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, UserSettings } from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import { normalizeMoneyAmount } from '~/utils/formatters';

/**
 * Parses a typed/pasted amount, tolerating both decimal commas ("12,5") and
 * thousands separators ("1,000" / "1,234.56") — naively swapping the first
 * comma for a dot would silently turn "1,000" into 1.
 */
export function parseAllocationAmount(value: string): number {
  const text = value.trim();
  let normalized: string;
  if (text.includes('.')) {
    // A dot is the decimal point; any commas are thousands separators.
    normalized = text.replace(/,/g, '');
  } else {
    const commaGroups = text.split(',');
    // A single comma followed by exactly three digits reads as a thousands
    // separator ("1,000"); one or two trailing digits read as decimals
    // ("12,5"). Multiple commas are always thousands separators.
    normalized =
      commaGroups.length === 2 && commaGroups[1].length !== 3
        ? commaGroups.join('.')
        : commaGroups.join('');
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Visual allocation state: a bar filling as the total gets distributed, with
 * the allocated/remaining figures underneath. Rendered inside
 * `AllocationFooter`, pinned above the Cancel/Save bar.
 */
function AllocationStatusBar({
  total,
  remaining,
  settings,
  themeColors,
}: {
  total: number;
  remaining: number;
  settings: UserSettings;
  themeColors: ColorPalette;
}) {
  const allocated = normalizeMoneyAmount(total - remaining);
  const ratio = total > 0 ? allocated / total : 0;
  const barColor =
    remaining < 0 ? themeColors.error : remaining === 0 ? themeColors.success : themeColors.primary;
  const remainingLabel =
    remaining > 0
      ? I18n.t('budget.left', { amount: money(remaining, settings) })
      : remaining < 0
        ? I18n.t('budget.over', { amount: money(Math.abs(remaining), settings) })
        : I18n.t('budget.allocated_done');

  return (
    <View className="rounded-2xl border border-border/40 bg-secondary/25 px-4 py-3">
      <View
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: withColorAlpha(barColor, 0.15) }}
      >
        <View
          className="h-1.5 rounded-full"
          style={{
            width: `${Math.max(0, Math.min(ratio, 1)) * 100}%`,
            backgroundColor: barColor,
          }}
        />
      </View>
      <View className="mt-2 flex-row items-center justify-between gap-3">
        <Text variant="caption" tone="muted" numberOfLines={1} className="min-w-0 shrink">
          {I18n.t('budget.allocated_summary', {
            allocated: money(allocated, settings),
            total: money(total, settings),
          })}
        </Text>
        <Text variant="caption" numberOfLines={1} style={{ color: barColor }}>
          {remainingLabel}
        </Text>
      </View>
    </View>
  );
}

/**
 * Compact, merged category list: one card, one row per root category. The
 * amount is read-only here; tapping a row opens the per-category sheet (which
 * also holds the subcategory breakdown). Rows drag-reorder by their grip
 * handle; the chosen order is what the saved budget renders in.
 */
export function AllocationCategoryList({
  rootCategories,
  amounts,
  childGaps,
  onPressCategory,
  onReorder,
  scrollableRef,
  settings,
  themeColors,
}: {
  rootCategories: Category[];
  amounts: Record<string, string>;
  /** Root category ids whose subcategory breakdown doesn't sum to the parent. */
  childGaps: Map<string, number>;
  onPressCategory: (categoryId: string) => void;
  /** Receives the reordered root category ids after a drag. */
  onReorder: (orderedIds: string[]) => void;
  /** The enclosing scroll view, so a drag near the edge auto-scrolls. */
  scrollableRef: AnimatedRef<Animated.ScrollView>;
  settings: UserSettings;
  themeColors: ColorPalette;
}) {
  return (
    // No overflow-hidden: it would clip a row's lift/shadow mid-drag. Rows and
    // the card share bg-card, so the rounded border still reads as one card.
    <View className="rounded-2xl border border-border/40 bg-card">
      <Sortable.Grid
        activeItemScale={1.02}
        activeItemShadowOpacity={0.08}
        columns={1}
        customHandle
        data={rootCategories}
        dragActivationDelay={0}
        inactiveItemOpacity={1}
        keyExtractor={(category) => category.id}
        rowGap={0}
        scrollableRef={scrollableRef}
        onDragEnd={({ data }) => {
          onReorder(data.map((category) => category.id));
          void triggerHaptic('selection');
        }}
        renderItem={({ item: category, index }) => {
          const amount = parseAllocationAmount(amounts[category.id] ?? '');
          const hasGap = childGaps.has(category.id);
          return (
            <View
              className={cn(
                'flex-row items-center bg-card',
                index > 0 && 'border-t border-border/25',
              )}
            >
              <Sortable.Handle>
                <View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`${I18n.t('common.reorder')} ${category.name}`}
                  className="py-3 pl-3 pr-1"
                >
                  <GripVertical size={16} color={themeColors.textMuted} />
                </View>
              </Sortable.Handle>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onPressCategory(category.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={category.name}
                className="min-w-0 flex-1 flex-row items-center gap-3 py-3 pr-4 active:bg-secondary/30"
              >
                <CategoryEmoji icon={category.icon} size={18} />
                <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
                  {category.name}
                </Text>
                {hasGap ? <AlertCircle size={14} color={themeColors.error} /> : null}
                <Text
                  variant={amount > 0 ? 'bodyStrong' : 'body'}
                  numberOfLines={1}
                  className={cn('shrink-0', amount > 0 ? '' : 'text-muted-foreground')}
                >
                  {money(amount, settings)}
                </Text>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

/**
 * Editor footer: the allocation status bar pinned above Cancel/Save. On iOS it
 * lifts above the keyboard so the live tally stays visible while typing
 * (Android resizes the window itself via adjustResize).
 */
export function AllocationFooter({
  showBar,
  total,
  remaining,
  settings,
  themeColors,
  onCancel,
  onSave,
  saveDisabled,
}: {
  showBar: boolean;
  total: number;
  remaining: number;
  settings: UserSettings;
  themeColors: ColorPalette;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  // The action bar's own safe-area padding already covers `insets.bottom` of
  // the distance, so lift by the difference to land exactly on the keyboard.
  const keyboardLift = Platform.OS === 'ios' ? Math.max(0, keyboardHeight - insets.bottom) : 0;

  return (
    <View
      className="border-t border-border/25 bg-background"
      style={{ paddingBottom: keyboardLift }}
    >
      {showBar ? (
        <View className="px-5 pt-3">
          <AllocationStatusBar
            total={total}
            remaining={remaining}
            settings={settings}
            themeColors={themeColors}
          />
        </View>
      ) : null}
      <SettingsActionBar
        className="border-t-0"
        onCancel={onCancel}
        onSave={onSave}
        saveDisabled={saveDisabled}
      />
    </View>
  );
}

/** Titled switch row used for the budget editor options. */
export function AllocationOptionRow({
  title,
  caption,
  value,
  onChange,
  themeColors,
}: {
  title: string;
  caption: string;
  value: boolean;
  onChange: (next: boolean) => void;
  themeColors: ColorPalette;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3">
      <View className="min-w-0 flex-1">
        <Text variant="body">{title}</Text>
        <Text variant="caption" tone="muted" className="mt-0.5">
          {caption}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          void triggerHaptic('selection');
          onChange(next);
        }}
        trackColor={{ true: themeColors.primary }}
      />
    </View>
  );
}
