import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';

interface OnboardingActionBarProps {
  onBack: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  extraContent?: React.ReactNode;
  backLabel?: string;
}

export function OnboardingActionBar({
  onBack,
  onPrimary,
  primaryLabel,
  primaryDisabled = false,
  extraContent,
  backLabel = I18n.t('common.back'),
}: OnboardingActionBarProps) {
  return (
    <SafeAreaView
      edges={['bottom']}
      style={styles.container}
      className="border-t border-border/20 bg-background/95"
    >
      <View style={styles.inner}>
        <View style={styles.row}>
          <Button variant="outline" className="flex-1" haptic="none" onPress={onBack}>
            <Text>{backLabel}</Text>
          </Button>
          <Button className="flex-[2]" haptic="none" disabled={primaryDisabled} onPress={onPrimary}>
            <Text>{primaryLabel}</Text>
          </Button>
        </View>
        {extraContent ? <View style={styles.extraContent}>{extraContent}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  inner: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  extraContent: {
    marginTop: spacing.xs,
  },
});
