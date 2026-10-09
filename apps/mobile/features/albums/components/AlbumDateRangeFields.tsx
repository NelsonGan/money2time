import { CalendarDays, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { DatePickerModal } from '~/components/datePicker';
import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { dayKeyFromDateLocal, dayKeyFromIsoLocal } from '~/utils/formatters';

interface AlbumDateRangeFieldsProps {
  startDate: string | null;
  endDate: string | null;
  onChangeStart: (date: string | null) => void;
  onChangeEnd: (date: string | null) => void;
  /** Set when rendered inside another Modal so the picker uses an in-place overlay. */
  overlay?: boolean;
}

const labelFormatterByLocale = new Map<string, Intl.DateTimeFormat>();

function formatDay(dateKey: string, locale: string): string {
  const [y, m, d] = dayKeyFromIsoLocal(dateKey).split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return dateKey;
  let formatter = labelFormatterByLocale.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    labelFormatterByLocale.set(locale, formatter);
  }
  return formatter.format(date);
}

/**
 * Optional start/end date overrides for a trip. Leaving them empty falls back to
 * the first/last transaction date (shown as "Auto").
 */
export function AlbumDateRangeFields({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  overlay = false,
}: AlbumDateRangeFieldsProps) {
  const themeColors = useThemeColors();
  const [picker, setPicker] = useState<'start' | 'end' | null>(null);
  const locale = I18n.locale ?? 'en';
  const today = dayKeyFromDateLocal(new Date());

  const renderRow = (
    label: string,
    value: string | null,
    onOpen: () => void,
    onClear: () => void,
  ) => (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onOpen();
      }}
      accessibilityRole="button"
      className="flex-1 flex-row items-center gap-2 rounded-2xl border border-border/40 bg-card px-3.5 py-3"
    >
      <CalendarDays size={17} color={themeColors.textMuted} />
      <View className="flex-1">
        <Text variant="label" tone="muted">
          {label}
        </Text>
        <Text variant="caption" className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value ? formatDay(value, locale) : '—'}
        </Text>
      </View>
      {value ? (
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          className="h-6 w-6 items-center justify-center rounded-full bg-secondary/70"
        >
          <X size={13} color={themeColors.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );

  return (
    <View className="flex-row gap-2.5">
      {renderRow(
        I18n.t('albums.start_date'),
        startDate,
        () => setPicker('start'),
        () => onChangeStart(null),
      )}
      {renderRow(
        I18n.t('albums.end_date'),
        endDate,
        () => setPicker('end'),
        () => onChangeEnd(null),
      )}

      <DatePickerModal
        visible={picker !== null}
        overlay={overlay}
        value={(picker === 'start' ? startDate : endDate) ?? today}
        title={picker === 'start' ? I18n.t('albums.start_date') : I18n.t('albums.end_date')}
        onSelect={(date) => {
          if (picker === 'start') onChangeStart(date);
          else if (picker === 'end') onChangeEnd(date);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}
