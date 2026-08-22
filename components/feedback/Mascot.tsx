import { Image } from 'expo-image';
import React, { useEffect, useMemo, useState } from 'react';
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
 * The coin-purse chick poses in `assets/mascots/`. One file per pose; the art is
 * theme-neutral, so light and dark render the same image.
 *
 * The `*-1` / `*-2` / `*-3` names are the three frames of an animated sequence
 * (see `MASCOT_SEQUENCES`). Each frame also stands on its own as a static pose,
 * and the resting frame of a sequence is the one to reach for: `save-3` is the
 * mascot hugging its piggy bank, `scan-3` is a receipt checked off.
 */
export type MascotName =
  // moods
  | 'happy'
  | 'waving'
  | 'excited'
  | 'love'
  | 'thumbs-up'
  | 'sad'
  | 'shocked'
  | 'confused'
  | 'thinking'
  | 'sleeping'
  | 'cheering'
  | 'celebrating'
  // doing something
  | 'receipt'
  | 'writing'
  | 'searching'
  | 'presenting'
  | 'phone-check'
  | 'cards'
  | 'laptop'
  | 'atm'
  | 'relaxing'
  // pro plans
  | 'premium-monthly'
  | 'premium-yearly'
  | 'premium-lifetime'
  // sequence frames
  | 'scan-1'
  | 'scan-2'
  | 'scan-3'
  | 'save-1'
  | 'save-2'
  | 'save-3'
  | 'grow-1'
  | 'grow-2'
  | 'grow-3';

const SOURCES: Record<MascotName, number> = {
  happy: require('../../assets/mascots/happy.png'),
  waving: require('../../assets/mascots/waving.png'),
  excited: require('../../assets/mascots/excited.png'),
  love: require('../../assets/mascots/love.png'),
  'thumbs-up': require('../../assets/mascots/thumbs-up.png'),
  sad: require('../../assets/mascots/sad.png'),
  shocked: require('../../assets/mascots/shocked.png'),
  confused: require('../../assets/mascots/confused.png'),
  thinking: require('../../assets/mascots/thinking.png'),
  sleeping: require('../../assets/mascots/sleeping.png'),
  cheering: require('../../assets/mascots/cheering.png'),
  celebrating: require('../../assets/mascots/celebrating.png'),
  receipt: require('../../assets/mascots/receipt.png'),
  writing: require('../../assets/mascots/writing.png'),
  searching: require('../../assets/mascots/searching.png'),
  presenting: require('../../assets/mascots/presenting.png'),
  'phone-check': require('../../assets/mascots/phone-check.png'),
  cards: require('../../assets/mascots/cards.png'),
  laptop: require('../../assets/mascots/laptop.png'),
  atm: require('../../assets/mascots/atm.png'),
  relaxing: require('../../assets/mascots/relaxing.png'),
  'premium-monthly': require('../../assets/mascots/premium-monthly.png'),
  'premium-yearly': require('../../assets/mascots/premium-yearly.png'),
  'premium-lifetime': require('../../assets/mascots/premium-lifetime.png'),
  'scan-1': require('../../assets/mascots/scan-1.png'),
  'scan-2': require('../../assets/mascots/scan-2.png'),
  'scan-3': require('../../assets/mascots/scan-3.png'),
  'save-1': require('../../assets/mascots/save-1.png'),
  'save-2': require('../../assets/mascots/save-2.png'),
  'save-3': require('../../assets/mascots/save-3.png'),
  'grow-1': require('../../assets/mascots/grow-1.png'),
  'grow-2': require('../../assets/mascots/grow-2.png'),
  'grow-3': require('../../assets/mascots/grow-3.png'),
};

/**
 * Three-frame flipbooks. The art is drawn so the last frame is the resting pose,
 * which is why it is held longer than the two that lead into it.
 */
export type MascotSequence = 'scan' | 'save' | 'grow';

const MASCOT_SEQUENCES: Record<MascotSequence, readonly MascotName[]> = {
  /** Snap a receipt, hold it up, get the tick. */
  scan: ['scan-1', 'scan-2', 'scan-3'],
  /** Coin over the piggy bank, coin in, happy hug. */
  save: ['save-1', 'save-2', 'save-3'],
  /** Small bars, the trend takes off, cheer. */
  grow: ['grow-1', 'grow-2', 'grow-3'],
};

/** Frame cadence. The resting frame holds; the two lead-in frames flip quickly. */
const FRAME_MS = 420;
const REST_MS = 1200;

const MOOD_TO_NAME: Record<string, MascotName> = {
  happy: 'happy',
  thinking: 'thinking',
  sleepy: 'sleeping',
  curious: 'searching',
  proud: 'thumbs-up',
};

/**
 * Poses decoded at boot. Deliberately not the whole catalogue: every warmed pose
 * costs a full-size decoded bitmap in memory, so this is only the handful that
 * shows up on the first screens (empty states, onboarding, the error boundary).
 * Everything else loads from the bundle when it is first rendered.
 */
const WARMUP: MascotName[] = [
  'happy',
  'searching',
  'thinking',
  'confused',
  'sleeping',
  'thumbs-up',
  'waving',
  'excited',
  // Not a first-screen pose, but `ImportingOverlay` throws itself up the moment
  // a restore starts; an undecoded pose there is a blank box mid-import.
  'laptop',
];

interface MascotProps {
  size?: number;
  name?: MascotName;
  mood?: string;
  /** Play a three-frame sequence instead of a single pose. Overrides `name`. */
  sequence?: MascotSequence;
  /** Idle bob for a single pose, frame playback for a sequence. */
  animate?: boolean;
  /** Sequences repeat by default; set false to stop on the resting frame. */
  loop?: boolean;
}

/**
 * Off-screen warmup component — mount once at app boot so expo-image decodes
 * the common mascots into the memory cache. Subsequent renders are instant.
 */
export function MascotWarmup() {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }}
    >
      {WARMUP.map((name) => (
        <Image
          key={name}
          source={SOURCES[name]}
          style={{ width: 1, height: 1 }}
          cachePolicy="memory-disk"
          priority="high"
        />
      ))}
    </View>
  );
}

export function Mascot({
  size = 80,
  name,
  mood,
  sequence,
  animate = true,
  loop = true,
}: MascotProps) {
  const bounce = useSharedValue(0);
  const [frame, setFrame] = useState(0);

  const frames = useMemo<readonly MascotName[]>(() => {
    if (sequence) return MASCOT_SEQUENCES[sequence];
    if (name) return [name];
    if (mood && MOOD_TO_NAME[mood]) return [MOOD_TO_NAME[mood]];
    return ['happy'];
  }, [sequence, name, mood]);

  // A sequence carries its own motion, so the idle bob is for single poses only.
  const bob = animate && frames.length === 1;

  useEffect(() => {
    if (frames.length < 2 || !animate) {
      // A still of a sequence shows the frame it settles on, not the lead-in:
      // `save` frozen on frame 1 is a coin stuck in mid-air.
      setFrame(frames.length - 1);
      return () => undefined;
    }

    setFrame(0);
    let index = 0;
    let timer: ReturnType<typeof setTimeout>;

    const queueNext = () => {
      const resting = index === frames.length - 1;
      if (resting && !loop) return;
      timer = setTimeout(
        () => {
          index = (index + 1) % frames.length;
          setFrame(index);
          queueNext();
        },
        resting ? REST_MS : FRAME_MS,
      );
    };

    queueNext();
    return () => clearTimeout(timer);
  }, [frames, animate, loop]);

  useEffect(() => {
    if (!bob) {
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
  }, [bob, bounce]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  // Frames are stacked and cross-faded by opacity rather than swapped into one
  // <Image>: swapping the source flashes an empty box on the first paint of a
  // pose that is not in the memory cache yet.
  return (
    <Animated.View style={[{ width: size, height: size }, bob ? animatedStyle : undefined]}>
      {frames.map((pose, index) => (
        <Image
          key={pose}
          source={SOURCES[pose]}
          style={
            frames.length > 1
              ? {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: size,
                  height: size,
                  opacity: index === frame ? 1 : 0,
                }
              : { width: size, height: size }
          }
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
          priority="high"
        />
      ))}
    </Animated.View>
  );
}
