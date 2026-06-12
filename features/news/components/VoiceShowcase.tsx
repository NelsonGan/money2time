import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, Clock, Mic } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { FONT } from '~/utils/fonts';
import { formatCurrency } from '~/utils/formatters';

// Card aspect ratio — tall enough to fit the mic hero, the spoken phrase, and
// the resulting transaction card without crowding.
const RATIO = 338 / 384;
const EQ_BARS = [0.45, 0.8, 0.35, 1, 0.6, 0.9, 0.5];

function withColorAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** A single equalizer bar that gently pulses between a min and full height. */
function EqualizerBar({ peak, delay, color }: { peak: number; delay: number; color: string }) {
  const progress = useSharedValue(0.3);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 520 }), withTiming(0.3, { duration: 520 })),
        -1,
        true,
      ),
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const minH = 6;
    const maxH = 28;
    const height = minH + (maxH - minH) * peak * progress.value;
    return { height };
  });

  return <Animated.View style={[styles.eqBar, { backgroundColor: color }, animatedStyle]} />;
}

/** Expanding ring behind the mic to signal active listening. */
function PulseRing({ color, delay }: { color: string; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2000 }), -1, false));
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.8 + progress.value * 0.9 }],
    opacity: 0.35 * (1 - progress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.pulseRing, { borderColor: color }, animatedStyle]}
    />
  );
}

export function VoiceShowcase({ width }: { width: number }) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const height = width / RATIO;

  return (
    <View
      style={[
        styles.frame,
        {
          width,
          height,
          backgroundColor: colors.background,
          borderColor: withColorAlpha(colors.text, 0.06),
        },
      ]}
    >
      <View style={styles.pad}>
        {/* Mic hero */}
        <View style={styles.heroRow}>
          <View style={styles.micWrap}>
            <PulseRing color={colors.primary} delay={0} />
            <PulseRing color={colors.primary} delay={1000} />
            <LinearGradient
              colors={[colors.primary, withColorAlpha(colors.primary, 0.78)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.micCircle}
            >
              <Mic size={26} color="#fff" strokeWidth={2.4} />
            </LinearGradient>
          </View>
          <View style={styles.eqRow}>
            {EQ_BARS.map((peak, index) => (
              <EqualizerBar
                key={index}
                peak={peak}
                delay={index * 90}
                color={withColorAlpha(colors.primary, 0.55)}
              />
            ))}
          </View>
        </View>

        {/* Spoken phrase bubble */}
        <View style={styles.bubbleWrap}>
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: withColorAlpha(colors.primary, 0.1),
                borderColor: withColorAlpha(colors.primary, 0.22),
              },
            ]}
          >
            <Text variant="label" tone="muted" style={styles.heard}>
              {I18n.t('news.showcase.voice_heard')}
            </Text>
            <Text style={[styles.phrase, { color: colors.text }]}>
              “{I18n.t('news.showcase.voice_example')}”
            </Text>
          </View>
        </View>

        {/* Transform arrow */}
        <View style={styles.arrowWrap}>
          <View
            style={[styles.arrowCircle, { backgroundColor: withColorAlpha(colors.text, 0.06) }]}
          >
            <ChevronDown size={16} color={colors.textMuted} strokeWidth={2.6} />
          </View>
        </View>

        {/* Resulting transaction card */}
        <View
          style={[
            styles.txnCard,
            { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.07) },
          ]}
        >
          <View
            style={[styles.emojiBubble, { backgroundColor: withColorAlpha(colors.primary, 0.1) }]}
          >
            <Text style={styles.emoji}>🚕</Text>
          </View>
          <View style={styles.txnMid}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
              {I18n.t('news.showcase.voice_category')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {I18n.t('news.showcase.voice_logged')}
            </Text>
          </View>
          <View style={styles.txnRight}>
            <Text style={[styles.amount, { color: colors.error }]} numberOfLines={1}>
              -{formatCurrency(30, settings.currencySymbol)}
            </Text>
            <View style={styles.timeRow}>
              <Clock size={11} color={colors.primary} strokeWidth={2.4} />
              <Text variant="caption" style={{ color: colors.textSoft }} numberOfLines={1}>
                2h 18m
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
    alignSelf: 'center',
    shadowColor: '#141E1A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  pad: {
    flex: 1,
    padding: 18,
    justifyContent: 'space-between',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 6,
  },
  micWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 2,
  },
  micCircle: {
    width: 62,
    height: 62,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    gap: 5,
  },
  eqBar: {
    width: 5,
    borderRadius: 999,
  },
  bubbleWrap: {
    alignItems: 'center',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  heard: {
    fontSize: 10,
    letterSpacing: 1.4,
  },
  phrase: {
    fontFamily: FONT.monoBold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  arrowWrap: {
    alignItems: 'center',
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  emojiBubble: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
  },
  txnMid: {
    flex: 1,
    minWidth: 0,
  },
  txnRight: {
    alignItems: 'flex-end',
  },
  amount: {
    fontFamily: FONT.monoBold,
    fontSize: 18,
    letterSpacing: -0.4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
});
