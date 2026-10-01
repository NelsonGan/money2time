import { ChevronRight, MapPin, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { Text } from '~/components/ui';
import { CityPickerSheet } from '~/components/ui/CityPickerSheet';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { AlbumLocation } from '~/types';

import { placeLabel } from '../utils';

interface AlbumLocationFieldProps {
  location: AlbumLocation | null;
  /** Called with the picked place, or null when the user clears it. */
  onChange: (location: AlbumLocation | null) => void;
}

/** The album editors' location row: opens the city picker, with a clear button once set. */
export function AlbumLocationField({ location, onChange }: AlbumLocationFieldProps) {
  const themeColors = useThemeColors();
  const [pickerVisible, setPickerVisible] = useState(false);

  return (
    <>
      <Text variant="label" tone="muted" className="mb-2 mt-5 px-1">
        {I18n.t('albums.location.label')}
      </Text>
      <Pressable
        onPress={() => setPickerVisible(true)}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-card px-4 py-3.5"
      >
        <MapPin size={18} color={location ? themeColors.primary : themeColors.textMuted} />
        <Text
          variant="body"
          numberOfLines={1}
          tone={location ? 'default' : 'muted'}
          className="flex-1"
        >
          {location ? placeLabel(location) : I18n.t('albums.location.add')}
        </Text>
        {location ? (
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('albums.location.clear')}
            hitSlop={10}
            className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
          >
            <X size={15} color={themeColors.textMuted} />
          </Pressable>
        ) : (
          <ChevronRight size={18} color={themeColors.textMuted} />
        )}
      </Pressable>
      <CityPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={onChange}
      />
    </>
  );
}
