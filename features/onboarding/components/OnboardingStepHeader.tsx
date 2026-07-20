import React from 'react';
import { View } from 'react-native';

import { Mascot, type MascotName } from '~/components/feedback/Mascot';
import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';

/** Shared inline mascot size so every onboarding page matches. */
export const ONBOARDING_HEADER_MASCOT_SIZE = 52;

interface OnboardingStepHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  compact?: boolean;
  /** When set, the mascot sits inline to the left of the title. */
  mascot?: MascotName;
}

export function OnboardingStepHeader({
  title,
  subtitle,
  children,
  compact,
  mascot,
}: OnboardingStepHeaderProps) {
  const containerStyle: object = {
    alignItems: 'center',
    paddingTop: compact ? spacing.xs : spacing.lg,
  };
  const subtitleStyle: object = {
    marginTop: compact ? spacing.xxs : spacing.sm,
    maxWidth: 340,
  };
  const contentStyle: object = {
    marginTop: compact ? spacing.xxs : spacing.sm,
    alignItems: 'center',
  };

  const titleNode = title ? (
    mascot ? (
      <View style={styles.titleRow}>
        <Mascot size={ONBOARDING_HEADER_MASCOT_SIZE} name={mascot} animate />
        <Text variant="title" className="text-foreground" style={styles.inlineTitle}>
          {title}
        </Text>
      </View>
    ) : (
      <Text variant="title" className="text-center text-foreground">
        {title}
      </Text>
    )
  ) : null;

  return (
    <View style={containerStyle}>
      {titleNode}
      {children ? <View style={contentStyle}>{children}</View> : null}
      {subtitle ? (
        <Text variant="friendly" tone="muted" className="text-center px-2" style={subtitleStyle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = {
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
  },
  inlineTitle: {
    flexShrink: 1,
  },
};
