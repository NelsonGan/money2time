import React, { useCallback, useEffect, useState } from 'react';

import { AccountsScreen } from './AccountsScreen';
import { CategoriesScreen } from './CategoriesScreen';
import { DisplaySettingsScreen } from './DisplaySettingsScreen';
import { HourlyValueScreen } from './HourlyValueScreen';
import { RecurringScreen } from './RecurringScreen';
import { SettingsScreen } from './SettingsScreen';
export type SettingsStackParamList = {
  SettingsHome: undefined;
  DisplaySettings: undefined;
  HourlyValue: undefined;
  Accounts: undefined;
  Categories: undefined;
  Recurring: undefined;
};

export type SettingsScreenName = keyof SettingsStackParamList;
type ScreenName = SettingsScreenName;

interface SettingsStackProps {
  resetToRootToken?: number;
  scrollToTopToken?: number;
  forceScreen?: SettingsScreenName | null;
  forceScreenToken?: number;
}

export function SettingsStack({
  resetToRootToken = 0,
  scrollToTopToken = 0,
  forceScreen = null,
  forceScreenToken = 0,
}: SettingsStackProps) {
  const [screen, setScreen] = useState<ScreenName>('SettingsHome');

  useEffect(() => {
    setScreen('SettingsHome');
  }, [resetToRootToken]);

  useEffect(() => {
    if (!forceScreen) return;
    setScreen(forceScreen);
  }, [forceScreen, forceScreenToken]);

  const goBack = useCallback(() => setScreen('SettingsHome'), []);

  switch (screen) {
    case 'DisplaySettings':
      return <DisplaySettingsScreen onBack={goBack} />;
    case 'HourlyValue':
      return <HourlyValueScreen onClose={goBack} />;
    case 'Accounts':
      return <AccountsScreen onBack={goBack} managementOnly />;
    case 'Categories':
      return <CategoriesScreen onBack={goBack} />;
    case 'Recurring':
      return <RecurringScreen onBack={goBack} />;
    default:
      return (
        <SettingsScreen
          scrollToTopToken={scrollToTopToken}
          onOpenDisplay={() => setScreen('DisplaySettings')}
          onOpenHourlyValue={() => setScreen('HourlyValue')}
          onOpenAccounts={() => setScreen('Accounts')}
          onOpenCategories={() => setScreen('Categories')}
          onOpenRecurring={() => setScreen('Recurring')}
        />
      );
  }
}
