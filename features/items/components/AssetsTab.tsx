import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { AddIconButton } from '~/components/ui/AddIconButton';
import { Button } from '~/components/ui/button';
import { ClayIcon } from '~/components/ui/ClayIcon';
import {
  type AssetsTab as AssetsTabName,
  AssetsTabBar,
} from '~/features/items/components/AssetsTabBar';
import { I18n } from '~/lib/i18n';

interface AccountsRenderOptions {
  hideBalances: boolean;
  onToggleBalances: () => void;
}

interface AssetsTabProps {
  renderAccounts: (options: AccountsRenderOptions) => React.ReactNode;
  /** Savings-goals pane; shares the balance-visibility toggle with Accounts. */
  renderGoals: (options: AccountsRenderOptions) => React.ReactNode;
  renderItems: () => React.ReactNode;
  onAddItem: () => void;
  /**
   * Top-right action for the Goals sub-tab (the gated add-goal button). A
   * node rather than a callback so the Pro gate can live in a leaf component
   * instead of subscribing this shell to goal state.
   */
  goalsActions: React.ReactNode;
  /** Opens account settings (the gear button now lives on the tab bar). */
  onOpenAccountSettings: () => void;
  /**
   * Opens the account editor for a new account. Without this the only way to
   * create one is settings -> a group card -> "add account", which buries
   * every account type (loans especially) four taps deep.
   */
  onAddAccount: () => void;
  /** Bumping this token resets the view back to the Accounts sub-tab. */
  resetToAccountsToken?: number;
}

const styles = StyleSheet.create({
  pane: { ...StyleSheet.absoluteFillObject },
  paneVisible: { opacity: 1 },
  paneHidden: { opacity: 0 },
});

function MountedPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Mount on first activation and keep mounted so the pane's state (e.g. the
  // accounts month pager) survives a tab switch. Hidden panes stay laid out but
  // invisible and non-interactive, mirroring the shell's MountedTab.
  const hasBeenActiveRef = useRef(active);
  if (active) hasBeenActiveRef.current = true;
  return (
    <View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.pane, active ? styles.paneVisible : styles.paneHidden]}
    >
      {hasBeenActiveRef.current ? children : null}
    </View>
  );
}

/**
 * Host for the assets page. Renders an underline tab bar (Accounts | Goals |
 * Items) and, on its top-right, the actions for the active tab — the accounts
 * settings + eye + add buttons on Accounts, the eye + add-goal buttons on
 * Goals, the add button on Items. Sub-screens stay mounted so
 * their state (month pager, scroll) survives a tab switch. Child screens
 * manage their own content but not the top safe-area inset — this host
 * provides it once, above the tab bar.
 */
export function AssetsTab({
  renderAccounts,
  renderGoals,
  renderItems,
  onAddItem,
  goalsActions,
  onOpenAccountSettings,
  onAddAccount,
  resetToAccountsToken,
}: AssetsTabProps) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<AssetsTabName>('accounts');
  const [hideBalances, setHideBalances] = useState(false);
  const toggleBalances = useCallback(() => setHideBalances((previous) => !previous), []);

  useEffect(() => {
    if (resetToAccountsToken !== undefined) setTab('accounts');
  }, [resetToAccountsToken]);

  const topInset = Math.max(
    insets.top,
    initialWindowMetrics?.insets.top ?? 0,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: topInset }}>
      <TabletContentContainer>
        <View className="flex-row items-center justify-between pr-5 pt-2">
          <AssetsTabBar
            active={tab}
            onChange={setTab}
            tabs={[
              { value: 'accounts', label: I18n.t('assets.tab_accounts') },
              { value: 'goals', label: I18n.t('assets.tab_goals') },
              { value: 'items', label: I18n.t('assets.tab_items') },
            ]}
          />
          {tab === 'items' ? (
            <AddIconButton onPress={onAddItem} accessibilityLabel={I18n.t('items.add')} />
          ) : tab === 'goals' ? (
            <View className="flex-row items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                haptic="selection"
                className="h-10 w-10 rounded-full"
                accessibilityLabel={
                  hideBalances ? I18n.t('accounts.show_balances') : I18n.t('accounts.hide_balances')
                }
                onPress={toggleBalances}
              >
                <ClayIcon name={hideBalances ? 'ui/eye-off' : 'ui/eye'} size={24} flatSize={18} />
              </Button>
              {goalsActions}
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                haptic="selection"
                className="h-10 w-10 rounded-full"
                accessibilityLabel={I18n.t('settings.account_settings')}
                onPress={onOpenAccountSettings}
              >
                <ClayIcon name="ui/settings" size={24} flatSize={18} />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                haptic="selection"
                className="h-10 w-10 rounded-full"
                accessibilityLabel={
                  hideBalances ? I18n.t('accounts.show_balances') : I18n.t('accounts.hide_balances')
                }
                onPress={toggleBalances}
              >
                <ClayIcon name={hideBalances ? 'ui/eye-off' : 'ui/eye'} size={24} flatSize={18} />
              </Button>
              <AddIconButton
                onPress={onAddAccount}
                accessibilityLabel={I18n.t('accounts.new_account')}
              />
            </View>
          )}
        </View>
      </TabletContentContainer>

      <View className="flex-1">
        <MountedPane active={tab === 'accounts'}>
          {renderAccounts({ hideBalances, onToggleBalances: toggleBalances })}
        </MountedPane>
        <MountedPane active={tab === 'goals'}>
          {renderGoals({ hideBalances, onToggleBalances: toggleBalances })}
        </MountedPane>
        <MountedPane active={tab === 'items'}>{renderItems()}</MountedPane>
      </View>
    </View>
  );
}
