import { Crown, Flame, Send } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { FacebookIcon, InstagramIcon, RedditIcon } from '~/components/icons/SocialIcons';
import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { FONT } from '~/utils/fonts';

interface ShareEarnShowcaseProps {
  width: number;
}

const TIERS = [
  {
    icon: <Send size={15} color="#fff" />,
    accent: '#22A565',
    rewardKey: 'shareEarn.tier1_reward',
    badgeKey: 'shareEarn.tier1_badge',
  },
  {
    icon: <Flame size={15} color="#fff" />,
    accent: '#F5A623',
    rewardKey: 'shareEarn.tier2_reward',
    badgeKey: 'shareEarn.tier2_badge',
  },
  {
    icon: <Crown size={15} color="#fff" fill="#fff" />,
    accent: '#A855F7',
    rewardKey: 'shareEarn.tier3_reward',
    badgeKey: 'shareEarn.tier3_badge',
  },
];

export function ShareEarnShowcase({ width }: ShareEarnShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View style={{ width }}>
      <View style={styles.platformRow}>
        {[
          { c: '#E1306C', i: <InstagramIcon size={18} /> },
          { c: '#FF2442', i: <Text style={styles.xhs}>小红书</Text> },
          { c: '#FF4500', i: <RedditIcon size={18} /> },
          { c: '#1877F2', i: <FacebookIcon size={17} /> },
        ].map((p, idx) => (
          <View key={idx} style={[styles.platform, { backgroundColor: p.c }]}>
            {p.i}
          </View>
        ))}
      </View>

      <View style={styles.tiers}>
        {TIERS.map((tier) => (
          <View
            key={tier.rewardKey}
            style={[styles.tierRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={[styles.tierIcon, { backgroundColor: tier.accent }]}>{tier.icon}</View>
            <Text variant="bodyStrong" style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
              {I18n.t(tier.rewardKey)}
            </Text>
            <View style={[styles.badge, { backgroundColor: `${tier.accent}22` }]}>
              <Text
                style={{
                  color: tier.accent,
                  fontFamily: FONT.extrabold,
                  fontWeight: '800',
                  fontSize: 10,
                }}
              >
                {I18n.t(tier.badgeKey)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  platformRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 14,
  },
  platform: {
    height: 38,
    width: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xhs: {
    color: '#fff',
    fontFamily: FONT.extrabold,
    fontWeight: '800',
    fontSize: 9,
  },
  tiers: {
    gap: 8,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tierIcon: {
    height: 30,
    width: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
