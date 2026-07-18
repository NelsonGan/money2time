import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Nfc, Smartphone, Zap } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';
import { formatCurrency } from '~/utils/formatters';

// Tall card: trigger tiles on top, a funnel of animated flow lines converging
// into the auto-log hub, and the transaction that comes out the bottom.
const RATIO = 338 / 366;
const PAD = 16;
const TILE_SIZE = 44;
const FLOW_HEIGHT = 104;
const HUB_SIZE = 54;
const DOT_SIZE = 7;
const CYCLE_MS = 2100;
const LANE_DELAY_MS = 700;

interface Point {
  x: number;
  y: number;
}

/** One payment "packet" travelling its lane's quadratic curve into the hub. */
function FlowDot({
  from,
  control,
  to,
  color,
  delay,
}: {
  from: Point;
  control: Point;
  to: Point;
  color: string;
  delay: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: CYCLE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      ),
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const mt = 1 - t;
    const x = mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x;
    const y = mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y;
    // Fade in leaving the tile and out entering the hub so the loop reads as a
    // steady stream instead of dots teleporting back to the top.
    const opacity = t < 0.12 ? t / 0.12 : t > 0.82 ? Math.max(0, (1 - t) / 0.18) : 1;
    return {
      opacity,
      transform: [{ translateX: x - DOT_SIZE / 2 }, { translateY: y - DOT_SIZE / 2 }],
    };
  });

  return <Animated.View style={[styles.flowDot, { backgroundColor: color }, animatedStyle]} />;
}

/** Trigger tile that pulses as its packet departs. */
function TriggerTile({
  icon,
  label,
  color,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  color: string;
  delay: number;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 260 }),
          withTiming(0, { duration: 520 }),
          withTiming(0, { duration: CYCLE_MS - 780 }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.09 }],
  }));

  return (
    <View style={styles.tile}>
      <Animated.View style={animatedStyle}>
        <View
          style={[
            styles.tileBubble,
            {
              backgroundColor: withColorAlpha(color, 0.12),
              borderColor: withColorAlpha(color, 0.3),
            },
          ]}
        >
          {icon}
        </View>
      </Animated.View>
      <Text variant="caption" tone="muted" numberOfLines={1} style={styles.tileLabel}>
        {label}
      </Text>
    </View>
  );
}

/** Expanding ring behind the hub to signal it is always listening. */
function HubRing({ color, delay }: { color: string; delay: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2000 }), -1, false));
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.85 + progress.value * 0.8 }],
    opacity: 0.35 * (1 - progress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.hubRing, { borderColor: color }, animatedStyle]}
    />
  );
}

export function AutoLogShowcase({ width }: { width: number }) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const height = width / RATIO;

  const innerWidth = width - PAD * 2;
  const laneXs = [innerWidth / 6, innerWidth / 2, (innerWidth * 5) / 6];
  const hubCenter: Point = { x: innerWidth / 2, y: FLOW_HEIGHT - HUB_SIZE / 2 };
  const flowStartY = 6;
  const flowEndY = hubCenter.y - HUB_SIZE / 2 - 3;
  const laneColors = [colors.primary, colors.sky, colors.lavender];
  const lanes = laneXs.map((x, index) => ({
    from: { x, y: flowStartY },
    // Dropping straight before bending inward reads as a funnel; the middle
    // lane degenerates to a straight line on purpose.
    control: { x, y: flowEndY * 0.72 },
    to: { x: hubCenter.x, y: flowEndY },
    color: laneColors[index]!,
  }));

  // "Apple Pay" stays English on purpose, like the Shortcuts action names in
  // constants/autoLogIntents.ts: it is a brand name, not copy.
  const triggers = [
    {
      key: 'tap',
      label: 'Apple Pay',
      icon: <Nfc size={20} color={colors.primary} strokeWidth={2.2} />,
    },
    {
      key: 'screenshot',
      label: I18n.t('news.showcase.autolog_screenshot'),
      icon: <Camera size={20} color={colors.sky} strokeWidth={2.2} />,
    },
    {
      key: 'backtap',
      label: I18n.t('news.showcase.autolog_backtap'),
      icon: <Smartphone size={20} color={colors.lavender} strokeWidth={2.2} />,
    },
  ];

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
        {/* The three triggers */}
        <View style={styles.tilesRow}>
          {triggers.map((trigger, index) => (
            <TriggerTile
              key={trigger.key}
              icon={trigger.icon}
              label={trigger.label}
              color={laneColors[index]!}
              delay={index * LANE_DELAY_MS}
            />
          ))}
        </View>

        {/* Funnel: dotted guide curves plus one travelling packet per lane */}
        <View style={styles.flowArea}>
          <Svg
            width={innerWidth}
            height={FLOW_HEIGHT}
            viewBox={`0 0 ${innerWidth} ${FLOW_HEIGHT}`}
            pointerEvents="none"
          >
            {lanes.map((lane, index) => (
              <Path
                key={index}
                d={`M ${lane.from.x} ${lane.from.y} Q ${lane.control.x} ${lane.control.y} ${lane.to.x} ${lane.to.y}`}
                stroke={withColorAlpha(lane.color, 0.35)}
                strokeWidth={2}
                strokeDasharray="1 7"
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </Svg>
          {lanes.map((lane, index) => (
            <FlowDot
              key={index}
              from={lane.from}
              control={lane.control}
              to={lane.to}
              color={lane.color}
              delay={index * LANE_DELAY_MS}
            />
          ))}
          <View
            style={[
              styles.hubWrap,
              { left: hubCenter.x - HUB_SIZE / 2, top: hubCenter.y - HUB_SIZE / 2 },
            ]}
          >
            <HubRing color={colors.primary} delay={0} />
            <HubRing color={colors.primary} delay={1000} />
            <LinearGradient
              colors={[colors.primary, withColorAlpha(colors.primary, 0.78)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hubCircle}
            >
              <Zap size={24} color="#fff" strokeWidth={2.4} fill="#fff" />
            </LinearGradient>
          </View>
        </View>

        {/* What falls out the bottom: a transaction logged by itself */}
        <View
          style={[
            styles.txnCard,
            { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.07) },
          ]}
        >
          <View
            style={[styles.emojiBubble, { backgroundColor: withColorAlpha(colors.primary, 0.1) }]}
          >
            <Text style={styles.emoji}>☕</Text>
          </View>
          <View style={styles.txnMid}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
              {I18n.t('news.showcase.autolog_merchant')}
            </Text>
            <View style={styles.loggedRow}>
              <Zap size={11} color={colors.primary} strokeWidth={2.4} fill={colors.primary} />
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {I18n.t('news.showcase.autolog_logged')}
              </Text>
            </View>
          </View>
          <Text style={[styles.amount, { color: colors.error }]} numberOfLines={1}>
            -{formatCurrency(4.5, settings.currencySymbol)}
          </Text>
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
    padding: PAD,
    justifyContent: 'space-between',
  },
  tilesRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  tileBubble: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: 11,
  },
  flowArea: {
    height: FLOW_HEIGHT,
  },
  flowDot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: 999,
  },
  hubWrap: {
    position: 'absolute',
    width: HUB_SIZE,
    height: HUB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubRing: {
    position: 'absolute',
    width: HUB_SIZE,
    height: HUB_SIZE,
    borderRadius: 999,
    borderWidth: 2,
  },
  hubCircle: {
    width: HUB_SIZE,
    height: HUB_SIZE,
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
  loggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  amount: {
    fontFamily: FONT.monoBold,
    fontSize: 18,
    letterSpacing: -0.4,
  },
});
