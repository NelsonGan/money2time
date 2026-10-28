// The one-time "You're Pro! Turn on Cloud Sync?" offer after a purchase.
// Shown once per install, only to a signed-out phone, never over another
// prompt, and only after the paywall has finished closing.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Button, FatButton, PromptSheet, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import {
  isAnyPromptVisible,
  markPromptHidden,
  markPromptVisible,
} from '~/services/globalPromptCoordinator';
import { withColorAlpha } from '~/utils/color';

import { useCloudSync } from '../CloudSyncContext';
import {
  hasPendingCloudSyncPrompt,
  subscribeCloudSyncPrompt,
  takePendingCloudSyncPrompt,
} from '../lib/promptRequest';
import { CLOUD_SYNC_HAPPY_ART } from './art';

const SHOWN_KEY = 'm2t.cloudSync.promptShown.v1';
/** Lets the paywall's close animation finish before a modal presents. */
const AFTER_PAYWALL_MS = 900;

export function CloudSyncPromptHost({
  allowed,
  onTurnOn,
}: {
  /** False while the app lock or an onboarding flow owns the screen. */
  allowed: boolean;
  onTurnOn: () => void;
}) {
  const { status } = useCloudSync();
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);
  const showingRef = useRef(false);

  useEffect(() => subscribeCloudSyncPrompt(() => setTick((n) => n + 1)), []);

  useEffect(() => {
    if (!allowed || !hasPendingCloudSyncPrompt() || showingRef.current) return;
    // Nothing to offer when sync is unavailable or already on.
    if (status === 'unavailable' || status === 'loading') return;
    if (status !== 'signedOut') {
      takePendingCloudSyncPrompt();
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        if (showingRef.current || isAnyPromptVisible('cloudSyncPrompt')) return;
        if (!takePendingCloudSyncPrompt()) return;
        const shown = await AsyncStorage.getItem(SHOWN_KEY).catch(() => null);
        if (shown) return;
        showingRef.current = true;
        markPromptVisible('cloudSyncPrompt');
        setVisible(true);
        void AsyncStorage.setItem(SHOWN_KEY, String(Date.now())).catch(() => undefined);
        void trackEvent(AnalyticsEvents.CLOUD_SYNC_PROMPT_SHOWN);
      })();
    }, AFTER_PAYWALL_MS);
    return () => clearTimeout(timer);
  }, [allowed, status, tick]);

  const hide = useCallback(() => {
    setVisible(false);
    showingRef.current = false;
    markPromptHidden('cloudSyncPrompt');
  }, []);

  const dismiss = useCallback(() => {
    hide();
    void trackEvent(AnalyticsEvents.CLOUD_SYNC_PROMPT_DISMISSED);
  }, [hide]);

  const accept = useCallback(() => {
    hide();
    void trackEvent(AnalyticsEvents.CLOUD_SYNC_PROMPT_ACCEPTED);
    onTurnOn();
  }, [hide, onTurnOn]);

  return (
    <CloudSyncPromptModal visible={visible && allowed} onEnable={accept} onDismiss={dismiss} />
  );
}

function CloudSyncPromptModal({
  visible,
  onEnable,
  onDismiss,
}: {
  visible: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  const chips = [I18n.t('cloud_sync.prompt.chip_backup'), I18n.t('cloud_sync.prompt.chip_devices')];

  return (
    <PromptSheet visible={visible} onDismiss={onDismiss}>
      <View style={[styles.panel, { backgroundColor: withColorAlpha(colors.primary, 0.08) }]}>
        <Image source={CLOUD_SYNC_HAPPY_ART} style={styles.art} accessible={false} />
      </View>
      <View style={styles.body}>
        <Text variant="heading" className="text-center">
          {I18n.t('cloud_sync.prompt.title')}
        </Text>
        <Text variant="friendly" tone="muted" className="mt-2 text-center">
          {I18n.t('cloud_sync.prompt.body')}
        </Text>
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View
              key={chip}
              style={[styles.chip, { backgroundColor: withColorAlpha(colors.success, 0.12) }]}
            >
              <Check size={14} color={colors.success} strokeWidth={3} />
              <Text variant="caption">{chip}</Text>
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <FatButton
            color={colors.primary}
            label={I18n.t('cloud_sync.prompt.cta')}
            onPress={onEnable}
          />
          <Button variant="ghost" size="sm" onPress={onDismiss}>
            <Text tone="muted">{I18n.t('cloud_sync.prompt.dismiss')}</Text>
          </Button>
        </View>
      </View>
    </PromptSheet>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  art: {
    width: 150,
    height: 150,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  footer: {
    gap: 6,
    marginTop: 18,
  },
});
