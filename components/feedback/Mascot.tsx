// money2time mascot - the friendly clock blob

import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { useThemeColors } from '~/hooks/useThemeColors';

type MascotMood = 'happy' | 'excited' | 'thinking' | 'sleepy' | 'proud' | 'curious';

interface MascotProps {
  size?: number;
  mood?: MascotMood;
  animate?: boolean;
}

const EYE_COLOR = '#1A5C4A';
const BLUSH_COLOR = '#F6C87B';

export function Mascot({ size = 80, mood = 'happy', animate = true }: MascotProps) {
  const themeColors = useThemeColors();
  const BODY_FILL = themeColors.primarySoft;
  const BODY_STROKE = themeColors.primaryMuted;
  const HAND_COLOR = themeColors.primary;
  const bounce = useSharedValue(0);
  const blink = useSharedValue(1);
  const breathe = useSharedValue(1);

  useEffect(() => {
    let blinkTimer: ReturnType<typeof setTimeout> | null = null;

    if (!animate) {
      bounce.value = 0;
      blink.value = 1;
      breathe.value = 1;
      return () => undefined;
    }

    // Gentle bouncing
    bounce.value = withRepeat(
      withSequence(withTiming(-4, { duration: 1000 }), withTiming(0, { duration: 1000 })),
      -1,
      true,
    );

    // Subtle breathing scale
    breathe.value = withRepeat(
      withSequence(withTiming(1.02, { duration: 2000 }), withTiming(1, { duration: 2000 })),
      -1,
      true,
    );

    // Occasional blink
    const startBlinking = () => {
      blink.value = withSequence(
        withDelay(
          3000 + Math.random() * 2000,
          withSequence(withTiming(0, { duration: 100 }), withTiming(1, { duration: 100 })),
        ),
      );
      blinkTimer = setTimeout(startBlinking, 5000 + Math.random() * 3000);
    };
    startBlinking();

    return () => {
      if (blinkTimer) clearTimeout(blinkTimer);
      cancelAnimation(bounce);
      cancelAnimation(blink);
      cancelAnimation(breathe);
      bounce.value = 0;
      blink.value = 1;
      breathe.value = 1;
    };
  }, [animate, blink, bounce, breathe]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }, { scale: breathe.value }],
  }));

  const getEyeExpression = () => {
    switch (mood) {
      case 'excited':
        return { eyeY: 38, eyeHeight: 10 };
      case 'thinking':
        return { eyeY: 40, eyeHeight: 6 };
      case 'sleepy':
        return { eyeY: 42, eyeHeight: 3 };
      case 'proud':
        return { eyeY: 38, eyeHeight: 9 };
      case 'curious':
        return { eyeY: 39, eyeHeight: 7 };
      default:
        return { eyeY: 40, eyeHeight: 8 };
    }
  };

  const getMouthPath = () => {
    switch (mood) {
      case 'excited':
        return 'M 42 55 Q 50 68 58 55';
      case 'thinking':
        return 'M 45 58 Q 50 58 55 58';
      case 'sleepy':
        return 'M 42 58 Q 50 52 58 58';
      case 'proud':
        return 'M 40 54 Q 50 66 60 54';
      case 'curious':
        return 'M 46 56 Q 50 60 54 56';
      default:
        return 'M 42 55 Q 50 62 58 55';
    }
  };

  const getRotation = () => (mood === 'curious' ? 5 : 0);

  const { eyeY, eyeHeight } = getEyeExpression();
  const rotation = getRotation();

  // For 'proud' mood, make eyes sparkly with small arcs above
  const renderProudSparkles = mood === 'proud';
  // For 'curious' mood, one eye slightly larger
  const leftEyeRx = mood === 'curious' ? 5 : 4;
  const rightEyeRx = 4;

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={animate ? animatedStyle : undefined}>
        <Svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          style={rotation ? { transform: [{ rotate: `${rotation}deg` }] } : undefined}
        >
          {/* Body - soft blob shape */}
          <Ellipse cx="50" cy="52" rx="38" ry="36" fill={BODY_FILL} />
          <Ellipse
            cx="50"
            cy="52"
            rx="38"
            ry="36"
            fill="none"
            stroke={BODY_STROKE}
            strokeWidth="3"
          />

          {/* Clock face circle */}
          <Circle cx="50" cy="50" r="28" fill="#FFFFFF" />
          <Circle cx="50" cy="50" r="28" fill="none" stroke={BODY_STROKE} strokeWidth="2" />

          {/* Clock hands */}
          <G>
            <Path d="M 50 50 L 50 32" stroke={HAND_COLOR} strokeWidth="3" strokeLinecap="round" />
            <Path d="M 50 50 L 62 42" stroke={HAND_COLOR} strokeWidth="2" strokeLinecap="round" />
            <Circle cx="50" cy="50" r="3" fill={HAND_COLOR} />
          </G>

          {/* Eyes */}
          <Ellipse cx="38" cy={eyeY} rx={leftEyeRx} ry={eyeHeight} fill={EYE_COLOR} />
          <Ellipse cx="62" cy={eyeY} rx={rightEyeRx} ry={eyeHeight} fill={EYE_COLOR} />

          {/* Eye shine */}
          <Circle cx="36" cy={eyeY - 2} r="1.5" fill="#FFFFFF" />
          <Circle cx="60" cy={eyeY - 2} r="1.5" fill="#FFFFFF" />

          {/* Proud sparkles */}
          {renderProudSparkles && (
            <>
              <Path
                d="M 33 30 L 35 28 L 37 30"
                stroke={HAND_COLOR}
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
              <Path
                d="M 57 30 L 59 28 L 61 30"
                stroke={HAND_COLOR}
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </>
          )}

          {/* Blush */}
          <Ellipse cx="28" cy="55" rx="6" ry="4" fill={BLUSH_COLOR} opacity={0.5} />
          <Ellipse cx="72" cy="55" rx="6" ry="4" fill={BLUSH_COLOR} opacity={0.5} />

          {/* Mouth */}
          <Path
            d={getMouthPath()}
            fill="none"
            stroke={EYE_COLOR}
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Small ears/antenna bumps */}
          <Circle cx="22" cy="28" r="8" fill={BODY_FILL} />
          <Circle cx="22" cy="28" r="8" fill="none" stroke={BODY_STROKE} strokeWidth="2" />
          <Circle cx="78" cy="28" r="8" fill={BODY_FILL} />
          <Circle cx="78" cy="28" r="8" fill="none" stroke={BODY_STROKE} strokeWidth="2" />
        </Svg>
      </Animated.View>
    </View>
  );
}
