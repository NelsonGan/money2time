import { Image } from 'expo-image';
import { Ellipsis, Users } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { BRAND_LOGOS, type BrandLogoKey } from '~/constants/brandLogos';
import { spacing } from '~/constants/designSystem';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/** Stable ids sent to Mixpanel as the `acquisition_source` user property. */
export type AcquisitionSource =
  | 'xiaohongshu'
  | 'reddit'
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'app_store'
  | 'google_play'
  | 'threads'
  | 'friends_family'
  | 'other';

interface SourceOption {
  id: AcquisitionSource;
  labelKey: string;
  /** Bundled brand logo, or a lucide fallback for non-brand sources. */
  logo?: BrandLogoKey;
  lucide?: 'friends' | 'other';
}

function buildOptions(): SourceOption[] {
  const options: SourceOption[] = [
    { id: 'xiaohongshu', labelKey: 'onboarding.source.xiaohongshu', logo: 'xiaohongshu' },
    { id: 'instagram', labelKey: 'onboarding.source.instagram', logo: 'instagram' },
    { id: 'tiktok', labelKey: 'onboarding.source.tiktok', logo: 'tiktok' },
    { id: 'reddit', labelKey: 'onboarding.source.reddit', logo: 'reddit' },
    { id: 'facebook', labelKey: 'onboarding.source.facebook', logo: 'facebook' },
    { id: 'threads', labelKey: 'onboarding.source.threads', logo: 'threads' },
  ];

  if (Platform.OS === 'android') {
    options.push({
      id: 'google_play',
      labelKey: 'onboarding.source.google_play',
      logo: 'googleplay',
    });
  } else {
    options.push({ id: 'app_store', labelKey: 'onboarding.source.app_store', logo: 'appstore' });
  }

  options.push(
    { id: 'friends_family', labelKey: 'onboarding.source.friends_family', lucide: 'friends' },
    { id: 'other', labelKey: 'onboarding.source.other', lucide: 'other' },
  );

  return options;
}

interface OnboardingSourceStepProps {
  selected: AcquisitionSource | null;
  onSelect: (source: AcquisitionSource) => void;
  onBack: () => void;
  onContinue: () => void;
}

const LOGO_SIZE = 34;

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
  },
  lucideBubble: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
  },
});

export function OnboardingSourceStep({
  selected,
  onSelect,
  onBack,
  onContinue,
}: OnboardingSourceStepProps) {
  const themeColors = useThemeColors();
  const swipeBackGesture = useEdgeSwipeBack(onBack);
  const options = React.useMemo(() => buildOptions(), []);

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepHeader
            title={I18n.t('onboarding.source.title')}
            subtitle={I18n.t('onboarding.source.subtitle')}
          />

          <Animated.View entering={FadeIn.delay(150).duration(300)} className="mt-6">
            <View style={styles.grid}>
              {options.map((option) => {
                const isSelected = selected === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t(option.labelKey)}
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      void triggerHaptic('selection');
                      onSelect(option.id);
                    }}
                    style={[
                      styles.option,
                      {
                        backgroundColor: isSelected ? `${themeColors.primary}0A` : themeColors.card,
                        borderColor: isSelected
                          ? `${themeColors.primary}66`
                          : `${themeColors.border}55`,
                      },
                    ]}
                  >
                    {option.logo ? (
                      <Image
                        source={BRAND_LOGOS[option.logo]}
                        style={styles.logo}
                        contentFit="cover"
                        accessible={false}
                      />
                    ) : (
                      <View
                        style={[
                          styles.lucideBubble,
                          { backgroundColor: `${themeColors.primary}14` },
                        ]}
                      >
                        {option.lucide === 'friends' ? (
                          <Users size={18} color={themeColors.primary} strokeWidth={2.2} />
                        ) : (
                          <Ellipsis size={18} color={themeColors.primary} strokeWidth={2.4} />
                        )}
                      </View>
                    )}
                    <Text
                      variant="bodyStrong"
                      className="text-foreground"
                      style={styles.optionLabel}
                      numberOfLines={2}
                    >
                      {I18n.t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </ScrollView>

        <OnboardingActionBar
          onBack={() => {
            void triggerHaptic('selection');
            onBack();
          }}
          onPrimary={() => {
            void triggerHaptic('medium');
            onContinue();
          }}
          primaryLabel={I18n.t('common.continue')}
          primaryDisabled={!selected}
        />
      </View>
    </GestureDetector>
  );
}
