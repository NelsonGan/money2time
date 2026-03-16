import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';

interface OnboardingStepHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  compact?: boolean;
}

export function OnboardingStepHeader({ title, subtitle, children, compact }: OnboardingStepHeaderProps) {
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

  return (
    <View style={containerStyle}>
      {title ? (
        <Text variant="title" className="text-center text-foreground">
          {title}
        </Text>
      ) : null}
      {children ? <View style={contentStyle}>{children}</View> : null}
      {subtitle ? (
        <Text variant="friendly" tone="muted" className="text-center px-2" style={subtitleStyle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
