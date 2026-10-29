import { Check, ChevronRight, Cloud, CloudOff, RefreshCw } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

import { useCloudSync, useCloudSyncEnabled, useCloudSyncProTag } from '../CloudSyncContext';
import { profileSyncState } from '../lib/profileStatus';
import { Spinning } from './SyncStatusView';

/**
 * Cloud Sync's shortcut on the Settings profile card: a pill under the name
 * with the live sync state. Opens the same screen as Settings > Data > Cloud
 * Sync, which does its own sign-in and Pro gating.
 */
export function CloudSyncProfilePill({ onPress }: { onPress: () => void }) {
  const enabled = useCloudSyncEnabled();
  const { status, isSyncing, lastError, linked, phoneLimited } = useCloudSync();
  const colors = useThemeColors();
  const showPro = useCloudSyncProTag();
  const state = enabled
    ? profileSyncState({ status, isSyncing, lastError, linked, phoneLimited })
    : null;
  if (!state) return null;

  const title = I18n.t('cloud_sync.tile_label');
  const statusText = state.statusKey ? I18n.t(`cloud_sync.${state.statusKey}`) : null;

  const tint =
    state.tone === 'on'
      ? colors.success
      : state.tone === 'busy' || state.tone === 'action'
        ? colors.primary
        : colors.textMuted;
  const background = withColorAlpha(tint, tint === colors.primary ? 0.1 : 0.12);

  const icon =
    state.tone === 'busy' ? (
      <Spinning>
        <RefreshCw size={13} color={tint} strokeWidth={2.4} />
      </Spinning>
    ) : state.tone === 'problem' ? (
      <CloudOff size={14} color={tint} strokeWidth={2.2} />
    ) : (
      <View>
        <Cloud size={15} color={tint} strokeWidth={2.2} />
        {state.tone === 'on' ? (
          <View
            className="absolute -bottom-0.5 -right-1 h-[9px] w-[9px] items-center justify-center rounded-full"
            style={{ backgroundColor: colors.success }}
          >
            <Check size={7} color="#fff" strokeWidth={4} />
          </View>
        ) : null}
      </View>
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        statusText ? I18n.t('cloud_sync.profile_a11y_label', { status: statusText }) : title
      }
      accessibilityHint={I18n.t('cloud_sync.profile_a11y_hint')}
      accessibilityState={{ busy: state.tone === 'busy' }}
      testID="settings-profile-cloud-sync"
      hitSlop={6}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className="mt-2 flex-row items-center gap-1.5 self-start rounded-full py-1 pl-2.5 pr-1.5 active:opacity-70"
      style={{ backgroundColor: background, maxWidth: '100%' }}
    >
      {icon}
      <Text variant="caption" numberOfLines={1} className="shrink text-xs">
        <Text variant="caption" className="text-xs" style={{ fontFamily: FONT.bold }}>
          {title}
        </Text>
        {statusText ? (
          <Text variant="caption" className="text-xs" style={{ color: tint }}>
            {` · ${statusText}`}
          </Text>
        ) : null}
      </Text>
      {showPro ? (
        <View className="rounded-full px-1.5 py-px" style={{ backgroundColor: colors.accent }}>
          <Text
            allowFontScaling={false}
            className="text-[9px] font-bold tracking-[1px]"
            style={{ color: '#fff' }}
          >
            PRO
          </Text>
        </View>
      ) : null}
      <ChevronRight size={14} color={colors.textMuted} />
    </Pressable>
  );
}
