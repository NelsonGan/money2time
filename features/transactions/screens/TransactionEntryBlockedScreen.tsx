import React from 'react';
import { View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { Button, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { PRO_LIMITS } from '~/constants/proLimits';
import { I18n } from '~/lib/i18n';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import { requestOpenTab } from '~/services/tabNavigation';

interface TransactionEntryBlockedScreenProps {
  activeAccountCount: number;
  onClose: () => void;
}

export function TransactionEntryBlockedScreen({
  activeAccountCount,
  onClose,
}: TransactionEntryBlockedScreenProps) {
  const openAccounts = () => {
    requestOpenTab('accounts');
    onClose();
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader onBack={onClose} title={I18n.t('onboarding.bootstrap.add_transaction')} />
      <View className="flex-1 justify-center px-5 pb-8">
        <EmptyState
          compact
          animateIn={false}
          mascotMood="thinking"
          title={I18n.t('pro.limit_reached_title')}
          message={I18n.t('add_action.over_account_limit_message', {
            active: activeAccountCount,
            count: PRO_LIMITS.FREE_MAX_ACCOUNTS,
          })}
        />
        <View className="gap-3">
          <Button onPress={() => requestOpenPaywall('accounts_transaction')}>
            <Text>{I18n.t('pro.upgrade')}</Text>
          </Button>
          <Button variant="outline" onPress={openAccounts}>
            <Text>{I18n.t('accounts.title')}</Text>
          </Button>
        </View>
      </View>
    </SettingsPageLayout>
  );
}
