// The one-time "Turn on Locations?" offer after the user's first entry since
// the feature shipped (README: Transaction locations). Shown at most once per
// install, only over a settled Main shell, never over another prompt, and the
// permission is asked only once the sheet has gone.

import { MapPin, Sparkles } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';

import { Button, FatButton, PromptSheet, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import {
  isAnyPromptVisible,
  markPromptHidden,
  markPromptVisible,
  subscribePromptChanges,
} from '~/services/globalPromptCoordinator';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';

import {
  hasPendingLocationsOffer,
  isLocationsOfferDone,
  locationsOfferStep,
  markLocationsOfferDone,
  subscribeLocationsOffer,
  takePendingLocationsOffer,
} from '../lib/locationsOffer';
import { getLocationPermission, requestLocationPermission } from '../services/deviceLocation';

const LOCATIONS_OFFER_ART = require('../../../assets/illustrations/locations-offer.png');

/** After the screen frees up: lets the sheet that saved the entry finish closing. */
const OFFER_DELAY_MS = 900;
/** The sheet's fade-out, before the system dialog or another prompt may appear. */
const SHEET_CLOSE_MS = 450;

export function LocationsOfferHost({
  allowed,
}: {
  /** App.tsx `rootPromptsAllowed`, and not behind the app lock. */
  allowed: boolean;
}) {
  const { settings, updateSettings } = useApp();
  const locationsEnabled = settings.transactionLocationsEnabled;
  const [visible, setVisible] = useState(false);
  const [tick, setTick] = useState(0);
  // Up, or closing: holds the coordinator until the sheet (and the system
  // dialog after it) are gone.
  const holdingRef = useRef(false);
  const allowedRef = useRef(allowed);
  allowedRef.current = allowed;
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (holdingRef.current) markPromptHidden('locationsOffer');
    },
    [],
  );

  // Anything that could free the screen tries again: a new request, another
  // prompt closing, the app coming back.
  const retry = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => subscribeLocationsOffer(retry), [retry]);
  useEffect(() => subscribePromptChanges(retry), [retry]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    return () => subscription.remove();
  }, [retry]);

  // Turning Locations on, here or in Settings, answers the offer for good.
  useEffect(() => {
    if (locationsEnabled) void markLocationsOfferDone();
  }, [locationsEnabled]);

  useEffect(() => {
    if (!allowed || holdingRef.current || !hasPendingLocationsOffer()) return undefined;
    const timer = setTimeout(() => {
      void (async () => {
        const [done, permission] = await Promise.all([
          isLocationsOfferDone(),
          getLocationPermission(),
        ]);
        if (!mountedRef.current || holdingRef.current) return;
        const step = locationsOfferStep({
          pending: hasPendingLocationsOffer(),
          done,
          locationsEnabled,
          locationUnavailable: permission.status === 'unavailable',
          allowed: allowedRef.current,
          appActive: AppState.currentState === 'active',
          otherPromptVisible: isAnyPromptVisible('locationsOffer'),
        });
        if (step === 'drop') {
          takePendingLocationsOffer();
          return;
        }
        if (step === 'wait') return;
        takePendingLocationsOffer();
        holdingRef.current = true;
        markPromptVisible('locationsOffer');
        // Answered before it is on screen: never shown twice, even after a crash.
        await markLocationsOfferDone();
        if (!mountedRef.current) return;
        setVisible(true);
        void trackEvent(AnalyticsEvents.LOCATIONS_OFFER_SHOWN);
      })();
    }, OFFER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [allowed, locationsEnabled, tick]);

  /** Closes the sheet, runs `after` once it has faded, then frees the coordinator. */
  const close = useCallback((after?: () => Promise<unknown>) => {
    setVisible(false);
    setTimeout(() => {
      void (async () => {
        try {
          await after?.();
        } finally {
          holdingRef.current = false;
          markPromptHidden('locationsOffer');
        }
      })();
    }, SHEET_CLOSE_MS);
  }, []);

  const accept = useCallback(() => {
    void triggerHaptic('selection');
    updateSettings({ transactionLocationsEnabled: true });
    void trackEvent(AnalyticsEvents.TRANSACTION_LOCATIONS_TOGGLED, {
      enabled: true,
      source: 'offer',
    });
    // The system dialog only once the sheet is gone: never two at once. A
    // refusal leaves Locations on with place search; Settings offers Allow.
    close(() => requestLocationPermission());
  }, [close, updateSettings]);

  const dismiss = useCallback(() => close(), [close]);

  return <LocationsOfferSheet visible={visible && allowed} onEnable={accept} onDismiss={dismiss} />;
}

function LocationsOfferSheet({
  visible,
  onEnable,
  onDismiss,
}: {
  visible: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) {
  const colors = useThemeColors();
  const chips = [
    { icon: MapPin, label: I18n.t('locations.map_title') },
    { icon: Sparkles, label: I18n.t('locations.offer_chip_auto') },
  ];

  return (
    <PromptSheet visible={visible} onDismiss={onDismiss}>
      <View style={[styles.panel, { backgroundColor: withColorAlpha(colors.primary, 0.08) }]}>
        <Image source={LOCATIONS_OFFER_ART} style={styles.art} accessible={false} />
      </View>
      <View style={styles.body}>
        <Text variant="heading" className="text-center">
          {I18n.t('locations.offer_title')}
        </Text>
        <Text variant="friendly" tone="muted" className="mt-2 text-center">
          {I18n.t('locations.offer_body')}
        </Text>
        <View style={styles.chips}>
          {chips.map(({ icon: Icon, label }) => (
            <View
              key={label}
              style={[styles.chip, { backgroundColor: withColorAlpha(colors.success, 0.12) }]}
            >
              <Icon size={14} color={colors.success} strokeWidth={2.5} />
              <Text variant="caption">{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <FatButton
            color={colors.primary}
            label={I18n.t('locations.map_turn_on')}
            onPress={onEnable}
          />
          <Button variant="ghost" size="sm" onPress={onDismiss}>
            <Text tone="muted">{I18n.t('common.not_now')}</Text>
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
