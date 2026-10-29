import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';

import { Text } from './text';

interface NoticeBannerProps {
  icon: LucideIcon;
  text: string;
  /** `info` is a note; `error` and `success` are announced as they appear. */
  tone?: 'info' | 'success' | 'error';
}

/**
 * One short message with its icon in a soft tinted box: an error, a
 * confirmation or a note, rather than a bare line of coloured text.
 */
export function NoticeBanner({ icon: Icon, text, tone = 'info' }: NoticeBannerProps) {
  const colors = useThemeColors();
  const accent =
    tone === 'error' ? colors.error : tone === 'success' ? colors.success : colors.primary;
  const announced = tone !== 'info';
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      accessible
      accessibilityRole={announced ? 'alert' : 'text'}
      accessibilityLiveRegion={announced ? 'polite' : 'none'}
      style={[
        styles.box,
        {
          backgroundColor: withColorAlpha(accent, 0.08),
          borderColor: withColorAlpha(accent, 0.2),
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: withColorAlpha(accent, 0.14) }]}>
        <Icon size={17} color={accent} />
      </View>
      <Text
        variant="body"
        style={[styles.text, announced ? { color: accent, fontWeight: '600' } : null]}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
});
