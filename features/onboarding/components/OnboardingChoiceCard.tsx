import React from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';

interface OnboardingChoiceCardProps {
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  tag?: string;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
  centered?: boolean;
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    borderRadius: 28,
    borderWidth: 1.5,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    minHeight: 150,
  },
  tag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  tagWrap: {
    marginBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  indicator: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  iconWrap: {
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredContent: {
    alignItems: 'center',
  },
  footer: {
    marginTop: spacing.md,
  },
});

export function OnboardingChoiceCard({
  title,
  description,
  selected,
  onPress,
  accessibilityLabel,
  tag,
  footer,
  icon,
  centered = false,
}: OnboardingChoiceCardProps) {
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const minHeight = windowHeight < 700 ? 110 : 150;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      className="active:opacity-95"
    >
      <View
        style={[
          styles.shell,
          {
            backgroundColor: selected ? `${themeColors.primary}0A` : themeColors.card,
            borderColor: selected ? `${themeColors.primary}66` : `${themeColors.border}55`,
            minHeight,
          },
        ]}
      >
        {tag ? (
          <View style={styles.tagWrap}>
            <View
              style={[
                styles.tag,
                {
                  backgroundColor: selected ? `${themeColors.primary}14` : themeColors.surfaceMuted,
                  borderColor: selected ? `${themeColors.primary}26` : `${themeColors.border}40`,
                },
              ]}
            >
              <Text variant="caption" tone={selected ? 'primary' : 'muted'}>
                {tag}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={[
            styles.indicator,
            {
              backgroundColor: selected ? `${themeColors.primary}16` : 'transparent',
              borderColor: selected ? `${themeColors.primary}66` : `${themeColors.border}55`,
            },
          ]}
        >
          {selected ? (
            <View style={[styles.indicatorDot, { backgroundColor: themeColors.primary }]} />
          ) : null}
        </View>

        <View style={centered ? styles.centeredContent : undefined}>
          {icon ? <View style={styles.iconWrap}>{icon}</View> : null}

          <Text
            variant="subheading"
            className={centered ? 'text-center text-foreground' : 'text-foreground'}
          >
            {title}
          </Text>
          <Text variant="body" tone="muted" className={centered ? 'mt-2 text-center' : 'mt-2'}>
            {description}
          </Text>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Pressable>
  );
}
