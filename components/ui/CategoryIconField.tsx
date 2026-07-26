import { ChevronRight, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { Text } from '~/components/ui/text';
import { classifyCategoryIcon, getCategoryIconMeta } from '~/constants/categoryIcons';
import type { CategoryIconPickerSession } from '~/features/settings/lib/categoryIconPickerBridge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface CategoryIconFieldProps {
  /** Current stored value, in the grammar in constants/categoryIcons.ts. */
  value: string;
  onChange: (value: string) => void;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
}

/**
 * The "choose an icon" row shared by the category and savings-goal editors.
 * Mirrors the account-logo field in AccountsScreen: same tile treatment, and the
 * clear button REPLACES the chevron once something is picked rather than
 * crowding in beside it.
 */
export function CategoryIconField({ value, onChange, onOpenIconPicker }: CategoryIconFieldProps) {
  const themeColors = useThemeColors();
  const classified = classifyCategoryIcon(value);

  // Name the selection the way the logo field names a bank: an uploaded image
  // and a raw emoji have no name of their own, so they borrow their tab's label.
  const label = (() => {
    switch (classified.kind) {
      case 'bundled':
        return getCategoryIconMeta(classified.id)?.name ?? I18n.t('category_icon.choose_title');
      case 'emoji':
        return I18n.t('category_icon.tab_emoji');
      case 'custom':
        return I18n.t('category_icon.tab_uploads');
      case 'none':
        return I18n.t('category_icon.choose_title');
    }
  })();

  return (
    <View>
      <Text variant="label" tone="muted" className="mb-2">
        {I18n.t('categories.icon')}
      </Text>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onOpenIconPicker({
            selectedValue: value || null,
            onSelect: (next) => onChange(next ?? ''),
          });
        }}
        className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={I18n.t('category_icon.choose_title')}
      >
        <CategoryEmoji icon={value} size={36} hidePlaceholder={!value} />
        <Text
          variant="body"
          tone={classified.kind === 'none' ? 'muted' : undefined}
          numberOfLines={1}
          className="flex-1"
        >
          {label}
        </Text>
        {value ? (
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onChange('');
            }}
            hitSlop={10}
            className="h-7 w-7 items-center justify-center rounded-full bg-secondary/70"
            accessibilityRole="button"
            accessibilityLabel={I18n.t('category_icon.clear')}
          >
            <X size={14} color={themeColors.textMuted} />
          </Pressable>
        ) : (
          <ChevronRight size={16} color={themeColors.textMuted} />
        )}
      </Pressable>
    </View>
  );
}
