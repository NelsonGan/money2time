import { Plus } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Button } from '~/components/ui/button';
import { I18n } from '~/lib/i18n';
import {
  AssetsTabBar,
  type AssetsTab as AssetsTabName,
} from '~/features/items/components/AssetsTabBar';

interface AssetsTabProps {
  renderAccounts: () => React.ReactNode;
  renderItems: () => React.ReactNode;
  onAddItem: () => void;
  /** Bumping this token resets the view back to the Accounts sub-tab. */
  resetToAccountsToken?: number;
}

const styles = StyleSheet.create({
  pane: { ...StyleSheet.absoluteFillObject },
  paneHidden: { opacity: 0, transform: [{ translateX: 100000 }] },
});

function MountedPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  const hasBeenActiveRef = useRef(active);
  if (active) hasBeenActiveRef.current = true;
  return (
    <View
      pointerEvents={active ? 'auto' : 'none'}
      style={[styles.pane, active ? undefined : styles.paneHidden]}
    >
      {hasBeenActiveRef.current ? children : null}
    </View>
  );
}

/**
 * Host for the assets page. Renders an underline tab bar (Accounts | Items) with
 * a top-right add button on the Items tab, and keeps both sub-screens mounted so
 * their internal state (month pager, scroll) survives a tab switch. The child
 * screens manage their own content but not the top safe-area inset — this host
 * provides it once, above the tab bar.
 */
export function AssetsTab({
  renderAccounts,
  renderItems,
  onAddItem,
  resetToAccountsToken,
}: AssetsTabProps) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<AssetsTabName>('accounts');

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
          ) : null}
        </View>
      </TabletContentContainer>

      <View className="flex-1">
        <MountedPane active={tab === 'accounts'}>{renderAccounts()}</MountedPane>
        <MountedPane active={tab === 'items'}>{renderItems()}</MountedPane>
      </View>
    </View>
  );
}
