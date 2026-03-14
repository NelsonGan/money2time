import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';

interface OnboardingStepHeaderProps {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  subtitle: {
    marginTop: spacing.sm,
    maxWidth: 340,
  },
  content: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
});

export function OnboardingStepHeader({ title, subtitle, children }: OnboardingStepHeaderProps) {
  return (
    <View style={styles.container}>
      {title ? (
        <Text variant="title" className="text-center text-foreground">
          {title}
        </Text>
      ) : null}
      {children ? <View style={styles.content}>{children}</View> : null}
      {subtitle ? (
        <Text variant="friendly" tone="muted" className="text-center px-2" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
