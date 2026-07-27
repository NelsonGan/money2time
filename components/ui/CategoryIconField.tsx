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
 * Tile side. Matches the single-line height of components/ui/input.tsx so the
 * tile can sit on one row beside a name field, and clears the 1.25x line box
 * CategoryEmoji gives an emoji (40px at this glyph size) so the tile never
 * crops the glyph it exists to show.
 */
const TILE = 54;

interface CategoryIconFieldProps {
  /** Current stored value, in the grammar in constants/categoryIcons.ts. */
  value: string;
  onChange: (value: string) => void;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
  /**
   * Heading above the tile. Pass null when the tile shares a row with a
   * labelled field, where a second heading only adds noise.
   */
  label?: string | null;
}

/**
 * The "choose an icon" control shared by the category and savings-goal editors.
 *
 * A compact tile rather than a full-width row: the artwork identifies itself, so
 * spelling out "Meal" beside it was noise, and naming the other two forms was
 * worse still ("Emoji" beside a visible emoji). The same shape as the budget
 * template editor's tile, so all three editors now read alike.
 */
export function CategoryIconField({
  value,
  onChange,
  onOpenIconPicker,
  label = I18n.t('categories.icon'),
}: CategoryIconFieldProps) {
  const themeColors = useThemeColors();

  return (
    <View>
      {label ? (
        <Text variant="label" tone="muted" className="mb-2.5 px-1">
          {label}
        </Text>
      ) : null}
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
          className="items-center justify-center rounded-[22px] border border-border/30 bg-card active:opacity-80"
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
