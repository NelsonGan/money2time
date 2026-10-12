import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SETTINGS_HORIZONTAL_PADDING, SettingsHeader, SettingsPageLayout } from '~/components/ui';
import { AddGoalButton } from '~/features/goals/components/AddGoalButton';
import { I18n } from '~/lib/i18n';

import { GoalsScreen } from './GoalsScreen';

interface GoalsTabScreenProps {
  onOpenGoal: (accountId: string) => void;
  onOpenGoalEditor: (params?: { accountId?: string }) => void;
}

/**
 * Goals as a page of its own in the bottom bar. The goals pane normally sits
 * under the Accounts tab's header, so on its own it brings a header and the
 * add button that tab's shell gives it.
 */
export function GoalsTabScreen({ onOpenGoal, onOpenGoalEditor }: GoalsTabScreenProps) {
  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pb-1 pt-5"
          title={I18n.t('nav.tab_goals')}
          rightAccessory={<AddGoalButton onOpenGoalEditor={onOpenGoalEditor} />}
        />
      </View>
      <GoalsScreen
        hideBalances={false}
        onOpenGoal={onOpenGoal}
        onOpenGoalEditor={onOpenGoalEditor}
      />
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
});
