import { Image } from 'expo-image';
import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * The clay coin-purse poses in `assets/mascots/`. One file per pose; the art is
 * theme-neutral, so light and dark render the same image.
 */
export type MascotName =
  | 'happy'
  | 'excited'
  | 'love'
  | 'waving'
  | 'thumbs-up'
  | 'carrying'
  | 'reading'
  | 'announce'
  | 'sleeping'
  | 'confused'
  | 'angry';

const SOURCES: Record<MascotName, number> = {
  happy: require('../../assets/mascots/happy.png'),
  excited: require('../../assets/mascots/excited.png'),
  love: require('../../assets/mascots/love.png'),
  waving: require('../../assets/mascots/waving.png'),
  'thumbs-up': require('../../assets/mascots/thumbs-up.png'),
  carrying: require('../../assets/mascots/carrying.png'),
  reading: require('../../assets/mascots/reading.png'),
  announce: require('../../assets/mascots/announce.png'),
  sleeping: require('../../assets/mascots/sleeping.png'),
  confused: require('../../assets/mascots/confused.png'),
  angry: require('../../assets/mascots/angry.png'),
};

const MOOD_TO_NAME: Record<string, MascotName> = {
  happy: 'happy',
  thinking: 'confused',
  sleepy: 'sleeping',
  curious: 'confused',
  proud: 'thumbs-up',
};

interface MascotProps {
  size?: number;
  name?: MascotName;
  mood?: string;
  animate?: boolean;
}

/**
 * Off-screen warmup component — mount once at app boot so expo-image decodes
 * each mascot into the memory cache. Subsequent renders are instant.
 */
export function MascotWarmup() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
    >
      {(Object.entries(SOURCES) as [MascotName, number][]).map(([name, source]) => (
        <Image
          key={name}
          source={source}
          style={{ width: 1, height: 1 }}
          cachePolicy="memory-disk"
          priority="high"
        />
      ))}
    </View>
  );
}

export function Mascot({ size = 80, name, mood, animate = true }: MascotProps) {
  const bounce = useSharedValue(0);

  const resolvedName: MascotName = useMemo(() => {
    if (name) return name;
    if (mood && MOOD_TO_NAME[mood]) return MOOD_TO_NAME[mood];
    return 'happy';
  }, [name, mood]);

  useEffect(() => {
    if (!animate) {
      bounce.value = 0;
      return () => undefined;
    }

    bounce.value = withRepeat(
      withSequence(withTiming(-4, { duration: 1000 }), withTiming(0, { duration: 1000 })),
      -1,
      true,
    );

    return () => {
      cancelAnimation(bounce);
      bounce.value = 0;
    };
  }, [animate, bounce]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, animate ? animatedStyle : undefined]}>
      <Image
        source={SOURCES[resolvedName]}
        style={{ width: size, height: size }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        priority="high"
      />
    </Animated.View>
  );
}
