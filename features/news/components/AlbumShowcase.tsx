import { LinearGradient } from 'expo-linear-gradient';
import { CalendarRange, Images } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatAmount } from '~/utils/formatters';

interface AlbumShowcaseProps {
  width: number;
}

interface SampleAlbum {
  nameKey: string;
  metaKey: string;
  amount: number;
  gradient: [string, string];
}

export function AlbumShowcase({ width }: AlbumShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  // Always render in money mode so the showcase displays the user's currency,
  // regardless of whether the app is currently in time-display mode.
  const amountSettings = { currencySymbol: settings.currencySymbol, displayMode: 'money' as const };

  const albums: SampleAlbum[] = [
    {
      nameKey: 'news.showcase.album_trip',
      metaKey: 'news.showcase.album_trip_meta',
      amount: 1240,
      gradient: [colors.primary, colors.sky],
    },
    {
      nameKey: 'news.showcase.album_celebration',
      metaKey: 'news.showcase.album_celebration_meta',
      amount: 380,
      gradient: [colors.lavender, colors.coral],
    },
  ];

  const cardHeight = Math.round(width * 0.42);

  return (
    <View style={[styles.container, { width }]}>
      {albums.map((album) => (
        <View
          key={album.nameKey}
          style={[
            styles.card,
            { height: cardHeight, borderColor: withColorAlpha(colors.text, 0.08) },
          ]}
        >
          <LinearGradient
            colors={album.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.coverIcon}>
            <Images size={20} color="#fff" strokeWidth={2.2} />
          </View>
          <View style={[styles.scrim, { backgroundColor: 'rgba(0,0,0,0.42)' }]}>
            <Text variant="caption" numberOfLines={1} className="text-white/85">
              {I18n.t(album.nameKey)}
            </Text>
            <View style={styles.row}>
              <Text variant="subheading" numberOfLines={1} className="text-white">
                {formatAmount(album.amount, amountSettings, { showSign: false })}
              </Text>
              <View style={styles.meta}>
                <CalendarRange size={11} color="rgba(255,255,255,0.8)" strokeWidth={2.2} />
                <Text variant="label" numberOfLines={1} className="text-white/75">
                  {I18n.t(album.metaKey)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  coverIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    height: 34,
    width: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  scrim: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  row: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
