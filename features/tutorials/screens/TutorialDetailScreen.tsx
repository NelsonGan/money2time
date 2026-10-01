import { useCallback } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { ClayIcon, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { StepPager, useStepPager } from '../components/StepPager';
import { TUTORIAL_IMAGE_SOURCES } from '../content/images.generated';
import { getTutorial } from '../content/tutorials';
import { tutorialWebUrl } from '../links';

interface TutorialDetailScreenProps {
  id: string;
  onBack: () => void;
}

/**
 * One tutorial, paged one step at a time on the same `StepPager` as
 * `AutoLogTutorialScreen`, because that walkthrough is the one users already
 * know and the two sit one tap apart.
 */
export function TutorialDetailScreen({ id, onBack }: TutorialDetailScreenProps) {
  const tutorial = getTutorial(id);
  const steps = tutorial?.steps ?? [];
  const { index, isLast, goNext, goBack } = useStepPager(steps.length, onBack);
  const step = steps[index];

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
              onPress={shareTutorial}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('tutorials.share')}
            >
              <ClayIcon name="ui/share" size={26} flatSize={20} />
            </Pressable>
          }
        />
      </View>

      <StepPager
        image={source}
        count={steps.length}
        index={index}
        isLast={isLast}
        onNext={goNext}
        onBack={goBack}
      >
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
      </StepPager>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  caption: {
    minHeight: 96,
    gap: 2,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
