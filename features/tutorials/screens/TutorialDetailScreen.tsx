import { Image } from 'expo-image';
import { ImageIcon, Share2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Button, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { TUTORIAL_IMAGE_SOURCES } from '../content/images.generated';
import { getTutorial } from '../content/tutorials';
import { tutorialWebUrl } from '../links';

interface TutorialDetailScreenProps {
  id: string;
  onBack: () => void;
}

/**
 * One tutorial, paged one step at a time. Deliberately the same shape as
 * `AutoLogTutorialScreen` (frame, dots, caption, ghost-back + primary-next),
 * because that walkthrough is the one users already know and the two now sit
 * one tap apart.
 */
export function TutorialDetailScreen({ id, onBack }: TutorialDetailScreenProps) {
  const themeColors = useThemeColors();
  const tutorial = getTutorial(id);
  const [index, setIndex] = useState(0);

  const steps = tutorial?.steps ?? [];
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const goNext = useCallback(() => {
    void triggerHaptic('medium');
    if (isLast) {
      onBack();
      return;
    }
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [isLast, onBack, steps.length]);

  const goBack = useCallback(() => {
    void triggerHaptic('selection');
    if (index === 0) {
      onBack();
      return;
    }
    setIndex((current) => Math.max(current - 1, 0));
  }, [index, onBack]);

  // Shares the website copy of the same tutorial, which offers to open the app.
  // That link works for someone who does not have Money2Time installed; a bare
  // `money2time://` deep link would do nothing for them.
  const shareTutorial = useCallback(() => {
    if (!tutorial) return;
    void triggerHaptic('selection');
    void Share.share({
      message: `${tutorial.title}\n${tutorialWebUrl(tutorial.id)}`,
      url: tutorialWebUrl(tutorial.id),
    }).catch(() => undefined);
  }, [tutorial]);

  if (!tutorial || !step) {
    return (
      <SettingsPageLayout edges={['top', 'bottom']}>
        <View className="px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('tutorials.title')}
          />
        </View>
        <View style={styles.missing}>
          <Text variant="body" tone="muted">
            {I18n.t('tutorials.empty_title')}
          </Text>
        </View>
      </SettingsPageLayout>
    );
  }

  const source = step.image ? TUTORIAL_IMAGE_SOURCES[step.image] : undefined;

  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={tutorial.title}
          rightAccessory={
            <Pressable
              style={styles.shareLink}
              onPress={shareTutorial}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('tutorials.share')}
            >
              <Share2 size={13} color={themeColors.primary} />
              <Text variant="caption" style={{ color: themeColors.primary }}>
                {I18n.t('tutorials.share')}
              </Text>
            </Pressable>
          }
        />
      </View>

      <View style={styles.body}>
        <View style={[styles.frame, { backgroundColor: `${themeColors.primary}0A` }]}>
          {source ? (
            <Image source={source} style={styles.frameImage} contentFit="contain" />
          ) : (
            <ImageIcon size={28} color={themeColors.textMuted} />
          )}
        </View>

        <View style={styles.dots}>
          {steps.map((item, dotIndex) => (
            <View
              key={`${item.title}-${dotIndex}`}
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

        <View style={styles.caption}>
          <Text variant="caption" tone="muted">
            {I18n.t('tutorials.step_counter', { current: index + 1, total: steps.length })}
          </Text>
          <Text variant="body" className="text-foreground font-semibold">
            {step.title}
          </Text>
          <Text variant="caption" tone="muted">
            {step.body}
          </Text>
        </View>

        <View style={[styles.nav, styles.navBottom]} className="border-t border-border/15">
          <Button variant="ghost" className="flex-1" haptic="none" onPress={goBack}>
            <Text>{I18n.t('common.back')}</Text>
          </Button>
          <Button className="flex-[2] shadow-glow" haptic="none" onPress={goNext}>
            <Text>{isLast ? I18n.t('common.done') : I18n.t('common.next')}</Text>
          </Button>
        </View>
      </View>
    </SettingsPageLayout>
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
  caption: {
    minHeight: 96,
    gap: 2,
  },
  shareLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  navBottom: {
    paddingBottom: spacing.md,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
