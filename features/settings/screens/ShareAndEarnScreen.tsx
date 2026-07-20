import { Image } from 'expo-image';
import { Award, Clock3, Crown, Flame, Gift, PartyPopper, Send } from 'lucide-react-native';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { BRAND_LOGOS, type BrandLogoKey } from '~/constants/brandLogos';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { FONT } from '~/utils/fonts';

interface ShareAndEarnScreenProps {
  onBack: () => void;
}

const DISCORD_URL = 'https://discord.gg/rFYCpcJhxd';

async function openFirstAvailable(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // try next
    }
  }
  const fallback = urls[urls.length - 1];
  if (fallback) await Linking.openURL(fallback).catch(() => undefined);
}

interface PlatformConfig {
  key: string;
  label: string;
  logo: BrandLogoKey;
  urls: string[];
}

const PLATFORMS: PlatformConfig[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    logo: 'instagram',
    urls: ['instagram://app', 'https://www.instagram.com'],
  },
  {
    key: 'xiaohongshu',
    label: '小红书',
    logo: 'xiaohongshu',
    urls: ['xhsdiscover://home', 'https://www.xiaohongshu.com'],
  },
  {
    key: 'reddit',
    label: 'Reddit',
    logo: 'reddit',
    urls: ['reddit://', 'https://www.reddit.com/submit'],
  },
  {
    key: 'facebook',
    label: 'Facebook',
    logo: 'facebook',
    urls: ['fb://', 'https://www.facebook.com'],
  },
  {
    key: 'x',
    label: 'X',
    logo: 'x',
    urls: ['twitter://post', 'https://twitter.com/compose/tweet'],
  },
  {
    key: 'threads',
    label: 'Threads',
    logo: 'threads',
    // "barcelona" is the Threads app's internal URL scheme.
    urls: ['barcelona://', 'https://www.threads.com'],
  },
];

interface RewardTier {
  key: string;
  icon: React.ReactNode;
  accent: string;
  badgeKey: string;
  rewardKey: string;
  descKey: string;
}

const TIERS: RewardTier[] = [
  {
    key: 'post',
    icon: <Send size={20} color="#fff" />,
    accent: '#22A565',
    badgeKey: 'shareEarn.tier1_badge',
    rewardKey: 'shareEarn.tier1_reward',
    descKey: 'shareEarn.tier1_desc',
  },
  {
    key: 'likes100',
    icon: <Flame size={20} color="#fff" />,
    accent: '#F5A623',
    badgeKey: 'shareEarn.tier2_badge',
    rewardKey: 'shareEarn.tier2_reward',
    descKey: 'shareEarn.tier2_desc',
  },
  {
    key: 'likes500',
    icon: <Crown size={20} color="#fff" fill="#fff" />,
    accent: '#A855F7',
    badgeKey: 'shareEarn.tier3_badge',
    rewardKey: 'shareEarn.tier3_reward',
    descKey: 'shareEarn.tier3_desc',
  },
];

export function ShareAndEarnScreen({ onBack }: ShareAndEarnScreenProps) {
  const colors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();

  const handlePlatform = (platform: PlatformConfig) => {
    void triggerHaptic('selection');
    void openFirstAvailable(platform.urls);
  };

  const handleClaim = () => {
    void triggerHaptic('selection');
    void Linking.openURL(DISCORD_URL).catch(() => undefined);
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('shareEarn.title')}
        infoTooltip={I18n.t('shareEarn.subtitle')}
      />

      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View style={styles.contentBody}>
          {/* Hero */}
          <View
            className="items-center rounded-[28px] border border-primary/15 bg-primary/8 px-5 pb-6 pt-5"
            style={{ overflow: 'hidden' }}
          >
            <View className="relative items-center justify-center">
              <Mascot size={104} name="celebrate" animate />
              <View
                className="absolute -right-1 -top-1 h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.primary }}
              >
                <Gift size={18} color="#fff" />
              </View>
            </View>
            <Text
              variant="subheading"
              className="mt-3 text-center text-lg"
              style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
            >
              {I18n.t('shareEarn.hero_title')}
            </Text>
            <Text variant="friendly" tone="muted" className="mt-1 text-center text-sm">
              {I18n.t('shareEarn.hero_body')}
            </Text>
          </View>

          {/* Post on (platforms) */}
          <Text
            variant="subheading"
            className="mb-2 mt-7 text-base"
            style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
          >
            {I18n.t('shareEarn.platforms_title')}
          </Text>
          <View style={styles.platformRow}>
            {PLATFORMS.map((platform) => (
              <Pressable
                key={platform.key}
                accessibilityRole="button"
                accessibilityLabel={platform.label}
                onPress={() => handlePlatform(platform)}
                className="items-center active:scale-[0.94] active:opacity-90"
                style={styles.platformItem}
              >
                <Image
                  source={BRAND_LOGOS[platform.logo]}
                  style={styles.platformLogo}
                  contentFit="cover"
                  accessible={false}
                />
                <Text variant="caption" tone="muted" className="mt-1.5 text-[11px]">
                  {platform.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Reward tiers */}
          <Text
            variant="subheading"
            className="mb-2 mt-7 text-base"
            style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
          >
            {I18n.t('shareEarn.rewards_title')}
          </Text>
          <View style={styles.tierList}>
            {TIERS.map((tier) => (
              <View
                key={tier.key}
                className="flex-row items-center gap-3.5 rounded-[22px] border border-border/35 bg-card px-4 py-4 shadow-soft"
              >
                <View
                  className="h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: tier.accent }}
                >
                  {tier.icon}
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text
                      variant="bodyStrong"
                      className="text-[15px]"
                      style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
                    >
                      {I18n.t(tier.rewardKey)}
                    </Text>
                    <View
                      className="rounded-full px-2 py-0.5"
                      style={{ backgroundColor: `${tier.accent}22` }}
                    >
                      <Text
                        className="text-[10px]"
                        style={{
                          color: tier.accent,
                          fontFamily: FONT.extrabold,
                          fontWeight: '800',
                        }}
                      >
                        {I18n.t(tier.badgeKey)}
                      </Text>
                    </View>
                  </View>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {I18n.t(tier.descKey)}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* How it works */}
          <View className="mt-6 rounded-[22px] border border-border/30 bg-surface px-4 py-4">
            <View className="mb-3 flex-row items-center gap-2">
              <PartyPopper size={16} color={colors.primary} />
              <Text
                variant="bodyStrong"
                className="text-sm"
                style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
              >
                {I18n.t('shareEarn.how_title')}
              </Text>
            </View>
            {[1, 2, 3].map((n) => (
              <View key={n} className="mb-2.5 flex-row gap-3">
                <View
                  className="h-6 w-6 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${colors.primary}1A` }}
                >
                  <Text
                    className="text-[11px]"
                    style={{ color: colors.primary, fontFamily: FONT.extrabold, fontWeight: '800' }}
                  >
                    {n}
                  </Text>
                </View>
                <Text variant="friendly" tone="muted" className="flex-1 text-[13px] leading-5">
                  {I18n.t(`shareEarn.step${n}_body`)}
                </Text>
              </View>
            ))}
          </View>

          {/* Claim */}
          <View className="mt-7 rounded-[24px] border border-primary/20 bg-primary/8 px-5 py-5">
            <View className="mb-1 flex-row items-center gap-2">
              <Award size={18} color={colors.primary} />
              <Text
                variant="bodyStrong"
                className="text-[15px]"
                style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
              >
                {I18n.t('shareEarn.claim_title')}
              </Text>
            </View>
            <Text variant="friendly" tone="muted" className="text-[13px] leading-5">
              {I18n.t('shareEarn.claim_body')}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={handleClaim}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-xl px-5 py-3.5 active:scale-[0.98] active:opacity-90"
              style={{ backgroundColor: colors.primary }}
            >
              <Clock3 size={16} color="#fff" />
              <Text
                className="text-sm"
                style={{ color: '#fff', fontFamily: FONT.extrabold, fontWeight: '800' }}
              >
                {I18n.t('shareEarn.claim_button')}
              </Text>
            </Pressable>
          </View>

          <Text variant="caption" tone="muted" className="mt-4 px-2 text-center text-[11px]">
            {I18n.t('shareEarn.fine_print')}
          </Text>
        </View>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  contentBody: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  tierList: {
    gap: spacing.sm,
  },
  // Six tiles no longer fit a single row, so wrap into rows of three.
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  platformItem: {
    width: '30%',
  },
  platformLogo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
