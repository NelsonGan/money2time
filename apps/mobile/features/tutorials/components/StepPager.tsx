import { Image, type ImageProps } from 'expo-image';
import { ImageIcon } from 'lucide-react-native';
import React, { type ReactNode, useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/**
 * Step through `count` steps. Next on the last step, and Back on the first,
 * call `onExit`: Back stays on screen for every step so the 1:2 button split
 * never reflows, and on the first step there is nowhere back to go but out,
 * which is what the header's back does too.
 */
export function useStepPager(count: number, onExit: () => void) {
  const [index, setIndex] = useState(0);
  const isLast = index === count - 1;

  // Haptics are fired here rather than by the Button, matching how the
  // onboarding steps drive OnboardingActionBar.
  const goNext = useCallback(() => {
    void triggerHaptic('medium');
    if (isLast) {
      onExit();
      return;
    }
    setIndex((current) => Math.min(current + 1, count - 1));
  }, [count, isLast, onExit]);

  const goBack = useCallback(() => {
    void triggerHaptic('selection');
    if (index === 0) {
      onExit();
      return;
    }
    setIndex((current) => Math.max(current - 1, 0));
  }, [index, onExit]);

  return { index, isLast, goNext, goBack };
}

interface StepPagerProps {
  image: ImageProps['source'];
  count: number;
  index: number;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  /** The caption under the dots. */
  children: ReactNode;
}

/**
 * A walkthrough page: the step's screenshot (or a placeholder), progress dots,
 * the caption, and a ghost Back beside a primary Next/Done. Used by the
 * tutorials and the auto-log setup guides so the two read the same.
 */
export function StepPager({
  image,
  count,
  index,
  isLast,
  onNext,
  onBack,
  children,
}: StepPagerProps) {
  const themeColors = useThemeColors();

  return (
    <View style={styles.body}>
      <View style={[styles.frame, { backgroundColor: `${themeColors.primary}0A` }]}>
        {image ? (
          <Image source={image} style={styles.frameImage} contentFit="contain" />
        ) : (
          <ImageIcon size={28} color={themeColors.textMuted} />
        )}
      </View>

      <View style={styles.dots}>
        {Array.from({ length: count }, (_, dotIndex) => (
          <View
            key={dotIndex}
            style={[
              styles.dot,
              {
                width: dotIndex === index ? 18 : 6,
                backgroundColor:
                  dotIndex === index ? themeColors.primary : `${themeColors.primary}33`,
              },
            ]}
          />
        ))}
      </View>

      {children}

      {/* Mirrors OnboardingActionBar (ghost back at flex-1, primary at
          flex-[2]) rather than reusing it. The page pads the bottom safe area,
          so the row only adds a little breathing room. */}
      <View style={styles.nav} className="border-t border-border/15">
        <Button variant="ghost" className="flex-1" haptic="none" onPress={onBack}>
          <Text>{I18n.t('common.back')}</Text>
        </Button>
        <Button className="flex-[2] shadow-glow" haptic="none" onPress={onNext}>
          <Text>{isLast ? I18n.t('common.done') : I18n.t('common.next')}</Text>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  frame: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameImage: {
    width: '100%',
    height: '100%',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
});
