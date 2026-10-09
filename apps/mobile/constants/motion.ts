import { withSpring, type WithSpringConfig } from 'react-native-reanimated';

export const springPresets = {
  pressIn: { damping: 17, stiffness: 430, mass: 0.7 } satisfies WithSpringConfig,
  pressOut: { damping: 16, stiffness: 340, mass: 0.75 } satisfies WithSpringConfig,
  softIn: { damping: 18, stiffness: 280, mass: 0.85 } satisfies WithSpringConfig,
  softOut: { damping: 18, stiffness: 250, mass: 0.9 } satisfies WithSpringConfig,
  settle: { damping: 14, stiffness: 220, mass: 0.8 } satisfies WithSpringConfig,
  wobble: { damping: 8, stiffness: 400, mass: 0.6 } satisfies WithSpringConfig,
  pop: { damping: 12, stiffness: 500, mass: 0.5 } satisfies WithSpringConfig,
  float: { damping: 20, stiffness: 80, mass: 1.2 } satisfies WithSpringConfig,
  gentle: { damping: 22, stiffness: 160, mass: 1.0 } satisfies WithSpringConfig,
  snappy: { damping: 14, stiffness: 380, mass: 0.55 } satisfies WithSpringConfig,
  celebration: { damping: 6, stiffness: 350, mass: 0.4 } satisfies WithSpringConfig,
} as const;

export const motionDurations = {
  fast: 160,
  normal: 240,
  slow: 360,
  gentle: 500,
  dramatic: 700,
} as const;

export function springToPressIn(value = 0.96) {
  return withSpring(value, springPresets.pressIn);
}

export function springToRest(value = 1) {
  return withSpring(value, springPresets.pressOut);
}
