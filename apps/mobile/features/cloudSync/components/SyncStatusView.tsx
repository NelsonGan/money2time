import { Check, CloudOff, RefreshCw } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Card, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';

import { useCloudSync } from '../CloudSyncContext';
import { formatSyncedAt } from '../lib/messages';
import { AccountActions } from './AccountActions';
import { CLOUD_SYNC_HAPPY_ART } from './art';
import { EmailPill } from './EmailPill';

/** Signed in and linked: the sync status and Sync now, then the account actions. */
export function SyncStatusView() {
  const sync = useCloudSync();
  const colors = useThemeColors();
  const title = sync.isSyncing
    ? I18n.t('cloud_sync.status_syncing')
    : sync.lastError === 'offline'
      ? I18n.t('cloud_sync.status_offline')
      : sync.lastError
        ? I18n.t('cloud_sync.status_error')
        : I18n.t('cloud_sync.status_on');
  const subtitle = sync.lastSyncedAt
    ? I18n.t('cloud_sync.status_synced', { time: formatSyncedAt(sync.lastSyncedAt) })
    : I18n.t('cloud_sync.status_never');
  const healthy = !sync.lastError;

  return (
    <View className="gap-4 pt-2">
      <Card className="items-center gap-3 px-5 py-6">
        <Image source={CLOUD_SYNC_HAPPY_ART} style={styles.art} accessible={false} />
        <View className="flex-row items-center gap-3" accessibilityLiveRegion="polite">
          <View
            style={[styles.dot, { backgroundColor: healthy ? colors.success : colors.textMuted }]}
          >
            {sync.isSyncing ? (
              <Spinning>
                <RefreshCw size={17} color={colors.card} strokeWidth={2.6} />
              </Spinning>
            ) : healthy ? (
              <Check size={18} color={colors.card} strokeWidth={3} />
            ) : (
              <CloudOff size={16} color={colors.card} />
            )}
          </View>
          <View>
            <Text variant="headingSm">{title}</Text>
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          </View>
        </View>
        {sync.user?.email ? <EmailPill email={sync.user.email} /> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('cloud_sync.sync_now')}
          accessibilityState={{ disabled: sync.isSyncing, busy: sync.isSyncing }}
          disabled={sync.isSyncing}
          onPress={() => {
            triggerHaptic('selection');
            void sync.syncNow();
          }}
          style={[
            styles.syncPill,
            { backgroundColor: withColorAlpha(colors.primary, 0.1) },
            sync.isSyncing && styles.dimmed,
          ]}
        >
          {sync.isSyncing ? (
            <Spinning>
              <RefreshCw size={16} color={colors.primary} />
            </Spinning>
          ) : (
            <RefreshCw size={16} color={colors.primary} />
          )}
          <Text variant="bodyStrong" style={{ color: colors.primary }}>
            {I18n.t('cloud_sync.sync_now')}
          </Text>
        </Pressable>
      </Card>

      <AccountActions />
    </View>
  );
}

/** Turns its child while mounted; holds still with Reduce Motion on. */
export function Spinning({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    turn.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduceMotion, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  art: { width: 128, height: 128 },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  dimmed: { opacity: 0.6 },
});
