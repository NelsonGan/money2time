import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { I18n } from '~/lib/i18n';

interface OnboardingActionBarProps {
  /** Omit to hide the secondary button entirely (e.g. the first page). */
  onBack?: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  /** Optional node rendered above the button row (e.g. a "Not now" link). */
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
      className="border-t border-border/15 bg-background/95"
    >
      <View style={styles.inner}>
        {extraContent ? <View style={styles.extraContent}>{extraContent}</View> : null}
        <View style={styles.row}>
          {onBack ? (
            <Button variant="ghost" className="flex-1" haptic="none" onPress={onBack}>
              <Text>{backLabel}</Text>
            </Button>
          ) : null}
          <Button
            className="flex-[2] shadow-glow"
            haptic="none"
            disabled={primaryDisabled}
            onPress={onPrimary}
          >
            <Text>{primaryLabel}</Text>
          </Button>
        </View>
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
    marginBottom: spacing.xs,
  },
});
