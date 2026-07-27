import { ImagePlus, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { Text } from '~/components/ui/text';
import type { CategoryIconPickerSession } from '~/features/settings/lib/categoryIconPickerBridge';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const GLYPH_SIZE = 32;
/**
 * Tile side. Has to clear the 1.25x line box CategoryEmoji gives an emoji, or
 * the tile crops the glyph it is meant to show.
 */
const TILE = 58;

interface CategoryIconFieldProps {
  /** Current stored value, in the grammar in constants/categoryIcons.ts. */
  value: string;
  onChange: (value: string) => void;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
}

/**
 * The "choose an icon" control shared by the category and savings-goal editors.
 *
 * A compact tile rather than a full-width row: the artwork identifies itself, so
 * spelling out "Meal" beside it was noise, and naming the other two forms was
 * worse still ("Emoji" beside a visible emoji). The same shape as the budget
 * template editor's tile, so all three editors now read alike.
 */
export function CategoryIconField({ value, onChange, onOpenIconPicker }: CategoryIconFieldProps) {
  const themeColors = useThemeColors();

  return (
    <View>
      <Text variant="label" tone="muted" className="mb-2">
        {I18n.t('categories.icon')}
      </Text>
      <View style={{ width: TILE }}>
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onOpenIconPicker({
              selectedValue: value || null,
              onSelect: (next) => onChange(next ?? ''),
            });
          }}
          style={{ width: TILE, height: TILE }}
          className="items-center justify-center rounded-[18px] border border-border/30 bg-secondary/30 active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel={I18n.t('category_icon.choose_title')}
        >
          {value ? (
            <CategoryEmoji icon={value} size={GLYPH_SIZE} />
          ) : (
            <ImagePlus size={22} color={themeColors.textMuted} />
          )}
        </Pressable>
        {value ? (
          // Corner badge rather than a sibling button: the tile is only as wide
          // as the artwork, so there is no row left to put a control on.
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onChange('');
            }}
            hitSlop={10}
            className="absolute -right-1.5 -top-1.5 h-6 w-6 items-center justify-center rounded-full border border-border/40 bg-card active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={I18n.t('category_icon.clear')}
          >
            <X size={13} color={themeColors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
