import { Eye, EyeOff, Plus, Settings } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Button } from '~/components/ui/button';
import {
  AssetsTabBar,
  type AssetsTab as AssetsTabName,
} from '~/features/items/components/AssetsTabBar';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

interface AccountsRenderOptions {
  hideBalances: boolean;
  onToggleBalances: () => void;
}

interface AssetsTabProps {
  renderAccounts: (options: AccountsRenderOptions) => React.ReactNode;
  renderItems: () => React.ReactNode;
  onAddItem: () => void;
  /** Opens account settings (the gear button now lives on the tab bar). */
  onOpenAccountSettings: () => void;
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
 * Host for the assets page. Renders an underline tab bar (Accounts | Items) and,
 * on its top-right, the actions for the active tab — the accounts settings + eye
 * (balance visibility) buttons on Accounts, the add button on Items. Both
 * sub-screens stay mounted so their state (month pager, scroll) survives a tab
 * switch. Child screens manage their own content but not the top safe-area
 * inset — this host provides it once, above the tab bar.
 */
export function AssetsTab({
  renderAccounts,
  renderItems,
  onAddItem,
  onOpenAccountSettings,
  resetToAccountsToken,
}: AssetsTabProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const [tab, setTab] = useState<AssetsTabName>('accounts');
  const [hideBalances, setHideBalances] = useState(false);

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
              { value: 'items', label: I18n.t('assets.tab_items') },
            ]}
          />
          {tab === 'items' ? (
            <Button size="icon" onPress={onAddItem} accessibilityLabel={I18n.t('items.add')}>
              <Plus size={18} color="#fff" />
            </Button>
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
                <Settings size={18} color={themeColors.textMuted} />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                haptic="selection"
                className="h-10 w-10 rounded-full"
                accessibilityLabel={
                  hideBalances ? I18n.t('accounts.show_balances') : I18n.t('accounts.hide_balances')
                }
                onPress={() => setHideBalances((previous) => !previous)}
              >
                {hideBalances ? (
                  <EyeOff size={18} color={themeColors.textMuted} />
                ) : (
                  <Eye size={18} color={themeColors.textMuted} />
                )}
              </Button>
            </View>
          )}
        </View>
      </TabletContentContainer>

      <View className="flex-1">
        <MountedPane active={tab === 'accounts'}>
          {renderAccounts({
            hideBalances,
            onToggleBalances: () => setHideBalances((previous) => !previous),
          })}
        </MountedPane>
        <MountedPane active={tab === 'items'}>{renderItems()}</MountedPane>
      </View>
    </View>
  );
}
