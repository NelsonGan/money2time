import { memo, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Marker } from 'react-native-maps';

import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';

/**
 * Google Maps draws a marker's view as a snapshot: track changes for a moment
 * after anything it shows changes (label, selection, colours: a theme switch
 * changes the card colour while the accent stays), then stop so panning stays
 * smooth.
 */
export function useBriefTracking(...deps: unknown[]): boolean {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tracking;
}

function Tail({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        marginTop: -1,
        borderLeftWidth: 6,
        borderRightWidth: 6,
        borderTopWidth: 7,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: color,
      }}
    />
  );
}

interface PinProps {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  /** Income-only place: the label reads as money in. */
  income?: boolean;
  selected: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}

/** A place's price tag: what was spent there, pointing at the spot. */
export const PlacePricePin = memo(function PlacePricePinImpl({
  id,
  latitude,
  longitude,
  label,
  income = false,
  selected,
  accessibilityLabel,
  onPress,
}: PinProps) {
  const themeColors = useThemeColors();
  const tracking = useBriefTracking(label, selected, income, themeColors.primary, themeColors.card);
  return (
    <Marker
      identifier={id}
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -18 }}
      tracksViewChanges={tracking}
      zIndex={selected ? 1000 : 1}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      accessibilityLabel={accessibilityLabel}
    >
      <View className="items-center">
        <View
          className={cn(
            'rounded-full border-2 px-2.5 py-1',
            selected ? 'border-primary bg-primary' : 'border-primary/70 bg-card',
          )}
        >
          <Text
            numberOfLines={1}
            className={cn(
              'text-[13px] font-extrabold leading-4',
              selected ? 'text-primary-foreground' : income ? 'text-success' : 'text-primary',
            )}
          >
            {label}
          </Text>
        </View>
        <Tail color={themeColors.primary} />
        <View className="mt-0.5 h-2 w-2 rounded-full border border-card bg-primary" />
      </View>
    </Marker>
  );
});

interface ClusterPinProps extends PinProps {
  count: number;
}

/** Several places close together at this zoom: how many entries, and their total. */
export const PlaceClusterPin = memo(function PlaceClusterPinImpl({
  id,
  latitude,
  longitude,
  label,
  count,
  selected,
  income = false,
  accessibilityLabel,
  onPress,
}: ClusterPinProps) {
  const themeColors = useThemeColors();
  const tracking = useBriefTracking(
    label,
    count,
    selected,
    income,
    themeColors.primary,
    themeColors.card,
  );
  return (
    <Marker
      identifier={id}
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      zIndex={selected ? 999 : 2}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      accessibilityLabel={accessibilityLabel}
    >
      <View className="flex-row items-center">
        <View
          className="z-10 h-8 min-w-8 items-center justify-center rounded-full border-2 border-card bg-primary px-1.5"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        >
          <Text className="text-[13px] font-extrabold leading-4 text-primary-foreground">
            {count > 99 ? '99+' : String(count)}
          </Text>
        </View>
        <View
          className={cn(
            '-ml-2 rounded-full border-2 py-1 pl-3 pr-2.5',
            selected ? 'border-primary bg-primary' : 'border-primary/70 bg-card',
          )}
        >
          <Text
            numberOfLines={1}
            className={cn(
              'text-[13px] font-extrabold leading-4',
              selected ? 'text-primary-foreground' : income ? 'text-success' : 'text-primary',
            )}
          >
            {label}
          </Text>
        </View>
      </View>
    </Marker>
  );
});
