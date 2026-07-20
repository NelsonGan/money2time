import { Ellipsis, Users } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import {
  AppStoreIcon,
  FacebookIcon,
  GooglePlayIcon,
  InstagramIcon,
  RedditIcon,
  ThreadsIcon,
  TikTokIcon,
  XiaohongshuIcon,
} from '~/components/icons/SocialIcons';
import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useResolvedTheme } from '~/context/ThemeContext';
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
  brandColor: string;
  renderIcon: (color: string, size: number) => React.ReactNode;
}

const iconRenderers: Record<AcquisitionSource, (color: string, size: number) => React.ReactNode> = {
  xiaohongshu: (color, size) => <XiaohongshuIcon size={size} color={color} />,
  reddit: (color, size) => <RedditIcon size={size} color={color} faceColor="#FFFFFF" />,
  instagram: (color, size) => <InstagramIcon size={size} color={color} />,
  facebook: (color, size) => <FacebookIcon size={size} color={color} />,
  tiktok: (color, size) => <TikTokIcon size={size} color={color} />,
  app_store: (color, size) => <AppStoreIcon size={size} color={color} />,
  google_play: (color, size) => <GooglePlayIcon size={size} color={color} />,
  threads: (color, size) => <ThreadsIcon size={size} color={color} />,
  friends_family: (color, size) => <Users size={size} color={color} strokeWidth={2.2} />,
  other: (color, size) => <Ellipsis size={size} color={color} strokeWidth={2.4} />,
};

function buildOptions(): SourceOption[] {
  const options: SourceOption[] = [
    {
      id: 'xiaohongshu',
      labelKey: 'onboarding.source.xiaohongshu',
      brandColor: '#FF2442',
      renderIcon: iconRenderers.xiaohongshu,
    },
    {
      id: 'instagram',
      labelKey: 'onboarding.source.instagram',
      brandColor: '#E4405F',
      renderIcon: iconRenderers.instagram,
    },
    {
      id: 'tiktok',
      labelKey: 'onboarding.source.tiktok',
      brandColor: '#0F0F0F',
      renderIcon: iconRenderers.tiktok,
    },
    {
      id: 'reddit',
      labelKey: 'onboarding.source.reddit',
      brandColor: '#FF4500',
      renderIcon: iconRenderers.reddit,
    },
    {
      id: 'facebook',
      labelKey: 'onboarding.source.facebook',
      brandColor: '#0866FF',
      renderIcon: iconRenderers.facebook,
    },
    {
      id: 'threads',
      labelKey: 'onboarding.source.threads',
      brandColor: '#101010',
      renderIcon: iconRenderers.threads,
    },
  ];

  if (Platform.OS === 'android') {
    options.push({
      id: 'google_play',
      labelKey: 'onboarding.source.google_play',
      brandColor: '#01875F',
      renderIcon: iconRenderers.google_play,
    });
  } else {
    options.push({
      id: 'app_store',
      labelKey: 'onboarding.source.app_store',
      brandColor: '#0D96F6',
      renderIcon: iconRenderers.app_store,
    });
  }

  options.push(
    {
      id: 'friends_family',
      labelKey: 'onboarding.source.friends_family',
      brandColor: '#7C5CBF',
      renderIcon: iconRenderers.friends_family,
    },
    {
      id: 'other',
      labelKey: 'onboarding.source.other',
      brandColor: '#64748B',
      renderIcon: iconRenderers.other,
    },
  );

  return options;
}

interface OnboardingSourceStepProps {
  selected: AcquisitionSource | null;
  onSelect: (source: AcquisitionSource) => void;
  onBack: () => void;
  onContinue: () => void;
}

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
    paddingVertical: spacing.sm + 2,
  },
  iconBubble: {
    width: 34,
    height: 34,
    borderRadius: 12,
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
  const resolvedTheme = useResolvedTheme();
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
                // The near-black TikTok/Threads marks vanish on a dark
                // background, so lift them to white there.
                const bubbleColor =
                  resolvedTheme === 'dark' && (option.id === 'tiktok' || option.id === 'threads')
                    ? '#FFFFFF'
                    : option.brandColor;
                const iconColor =
                  resolvedTheme === 'dark' && (option.id === 'tiktok' || option.id === 'threads')
                    ? '#111111'
                    : '#FFFFFF';
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
                    <View style={[styles.iconBubble, { backgroundColor: bubbleColor }]}>
                      {option.renderIcon(iconColor, 18)}
                    </View>
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
