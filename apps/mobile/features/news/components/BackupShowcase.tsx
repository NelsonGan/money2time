import { Check, CloudUpload, ShieldCheck } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface BackupShowcaseProps {
  width: number;
}

export function BackupShowcase({ width }: BackupShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        { width, backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
      ]}
    >
      <View style={styles.cloudWrap}>
        <View
          style={[styles.cloudBubble, { backgroundColor: withColorAlpha(colors.primary, 0.14) }]}
        >
          <CloudUpload size={34} color={colors.primary} strokeWidth={2.2} />
        </View>
        {/* The tick is the whole point of this release: the uploads land again. */}
        <View
          style={[styles.checkBadge, { backgroundColor: colors.success, borderColor: colors.card }]}
        >
          <Check size={13} color="#fff" strokeWidth={3} />
        </View>
      </View>

      <View style={styles.textCol}>
        <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
          {I18n.t('onboarding.backup.provider_google')}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
          {I18n.t('onboarding.backup.bullet_automatic_title')}
        </Text>
      </View>

      <View style={[styles.statusPill, { backgroundColor: withColorAlpha(colors.success, 0.14) }]}>
        <ShieldCheck size={15} color={colors.success} strokeWidth={2.2} />
        <Text variant="caption" numberOfLines={1} style={{ color: colors.success }}>
          {I18n.t('news.showcase.backup_working')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 14,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 26,
    paddingHorizontal: 20,
  },
  cloudWrap: {
    position: 'relative',
  },
  cloudBubble: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    alignItems: 'center',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
});
