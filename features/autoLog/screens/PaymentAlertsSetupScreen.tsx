import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import {
  requestPaymentAlertDrain,
  subscribeTestAlertResult,
  type TestAlertResult,
} from '~/services/paymentAlertsBridge';
import {
  getNotificationAccessGranted,
  openNotificationAccessSettings,
  postNotificationTestAlert,
  rebindNotificationListener,
  writeListenerConfig,
} from '~/services/paymentCapture';
import type { PaymentAlertSource } from '~/types';
import { formatAmount } from '~/utils/formatters';

import { AppPickerList, type PickableApp } from '../components/AppPickerList';
import { PaysFromControl } from '../components/PaysFromControl';
import { isPayableAccount } from '../lib/binding';
import {
  androidCapturePackages,
  findAlertSource,
  newAlertSource,
  withAlertSource,
  withoutAlertSource,
} from '../lib/prefs';

type Step = 'intro' | 'access' | 'apps' | 'test';

interface PaymentAlertsSetupScreenProps {
  /** `apps` reopens the flow on the app picker, for a user who already granted access. */
  initialStep?: 'apps';
  onClose: () => void;
}

/** How long the test waits for its own notification to come back. */
const TEST_TIMEOUT_MS = 10000;

/**
 * Android setup for payment notifications: the prominent disclosure Google
 * Play requires before the system toggle, notification access, the apps to
 * read and which account each pays from, then a test alert.
 */
export function PaymentAlertsSetupScreen({ initialStep, onClose }: PaymentAlertsSetupScreenProps) {
  const { accounts, categories, settings } = useApp();
  const { paymentAlertPrefs: prefs, updatePaymentAlertPrefs: updatePrefs } = useApp();
  const [step, setStep] = useState<Step>(initialStep ?? 'intro');
  const [testState, setTestState] = useState<'idle' | 'waiting' | 'done' | 'timeout'>('idle');
  const [testResult, setTestResult] = useState<TestAlertResult | null>(null);
  const testTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialStep) return;
    void trackEvent(AnalyticsEvents.AUTOLOG_ALERTS_SETUP, {
      step: 'disclosure_viewed',
      platform: 'android',
    });
  }, [initialStep]);

  // Back from Android settings: move on as soon as access is on.
  useEffect(() => {
    const check = async () => {
      if (await getNotificationAccessGranted()) {
        setStep((current) => {
          if (current === 'access' || current === 'intro') {
            void trackEvent(AnalyticsEvents.AUTOLOG_ALERTS_SETUP, {
              step: 'access_granted',
              platform: 'android',
            });
            return 'apps';
          }
          return current;
        });
      }
    };
    if (step === 'access') void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [step]);

  useEffect(() => {
    return subscribeTestAlertResult((result) => {
      if (testTimer.current) clearTimeout(testTimer.current);
      setTestResult(result);
      setTestState('done');
      void triggerHaptic('success');
      void trackEvent(AnalyticsEvents.AUTOLOG_ALERTS_SETUP, {
        step: 'test_passed',
        platform: 'android',
      });
    });
  }, []);

  useEffect(
    () => () => {
      if (testTimer.current) clearTimeout(testTimer.current);
    },
    [],
  );

  const androidSources = useMemo(
    () =>
      Object.values(prefs.sources).filter((source) => source.channel === 'android_notification'),
    [prefs.sources],
  );
  const selected = useMemo(
    () =>
      new Set(androidSources.filter((source) => source.enabled).map((source) => source.sourceKey)),
    [androidSources],
  );

  const openSettings = useCallback(() => {
    void triggerHaptic('medium');
    void trackEvent(AnalyticsEvents.AUTOLOG_ALERTS_SETUP, {
      step: 'settings_opened',
      platform: 'android',
    });
    setStep('access');
    void openNotificationAccessSettings();
  }, []);

  // Access survives turning the feature off in the app, so a returning user
  // who still has it goes straight to the apps instead of the system screen.
  const continueFromIntro = useCallback(async () => {
    if (await getNotificationAccessGranted()) {
      void triggerHaptic('medium');
      setStep('apps');
      return;
    }
    openSettings();
  }, [openSettings]);

  const toggleApp = useCallback(
    (app: PickableApp, on: boolean) => {
      updatePrefs((previous) => {
        if (!on) return withoutAlertSource(previous, 'android_notification', app.package);
        const existing = findAlertSource(previous, 'android_notification', app.package);
        if (existing) return withAlertSource(previous, { ...existing, enabled: true });
        return withAlertSource(
          previous,
          newAlertSource(
            {
              channel: 'android_notification',
              sourceKey: app.package,
              label: app.label,
              accountId: null,
            },
            new Date().toISOString(),
          ),
        );
      });
    },
    [updatePrefs],
  );

  const setBinding = useCallback(
    (source: PaymentAlertSource, accountId: string) => {
      updatePrefs((previous) => withAlertSource(previous, { ...source, accountId }));
    },
    [updatePrefs],
  );

  const finishApps = useCallback(() => {
    void triggerHaptic('medium');
    const next = { ...prefs, alertsEnabled: true };
    updatePrefs(next);
    // Write now rather than waiting for the sync effect, so the test alert
    // that follows is already accepted.
    writeListenerConfig({
      enabled: true,
      packages: androidCapturePackages(next),
      allowShell: __DEV__,
    });
    // A listener that unbound itself when alerts were last switched off
    // stays unbound until asked; harmless when it is already connected.
    void rebindNotificationListener();
    void trackEvent(AnalyticsEvents.AUTOLOG_ALERTS_SETUP, {
      step: 'source_added',
      platform: 'android',
      count: androidCapturePackages(next).length,
    });
    setStep('test');
  }, [prefs, updatePrefs]);

  const sendTest = useCallback(async () => {
    setTestState('waiting');
    setTestResult(null);
    if (testTimer.current) clearTimeout(testTimer.current);
    testTimer.current = setTimeout(() => setTestState('timeout'), TEST_TIMEOUT_MS);
    const amount = `${settings.currencyCode} 1.00`;
    const sent = await postNotificationTestAlert(
      I18n.t('payment_alerts.test_alert_title'),
      I18n.t('payment_alerts.test_alert_body', { amount }),
      I18n.t('payment_alerts.test_channel_name'),
    );
    if (!sent) {
      if (testTimer.current) clearTimeout(testTimer.current);
      setTestState('timeout');
      return;
    }
    // The listener writes the capture; drain promptly in case the event is missed.
    setTimeout(() => requestPaymentAlertDrain(), 1500);
  }, [settings.currencyCode]);

  const testAccount = accounts.find((item) => item.id === testResult?.accountId);
  const testCategory = categories.find((item) => item.id === testResult?.categoryId);

  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={I18n.t('payment_alerts.title')}
        />
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-5 px-5 pb-12">
        {step === 'intro' ? (
          <>
            <View className="items-center">
              <Mascot name="phone-check" size={140} />
            </View>
            <Text variant="heading" className="text-foreground">
              {I18n.t('payment_alerts.disclosure_title')}
            </Text>
            <Text variant="body" className="text-foreground">
              {I18n.t('payment_alerts.disclosure_body')}
            </Text>
            <View className="gap-3 rounded-2xl border border-border/30 bg-card p-4">
              {['disclosure_point_selected', 'disclosure_point_device'].map((key) => (
                <View key={key} className="flex-row gap-3">
                  <Text variant="body" tone="primary">
                    •
                  </Text>
                  <Text variant="body" className="flex-1 text-foreground">
                    {I18n.t(`payment_alerts.${key}`)}
                  </Text>
                </View>
              ))}
            </View>
            <Text variant="caption" tone="muted">
              {I18n.t('payment_alerts.disclosure_android_warning')}
            </Text>
            <Button onPress={() => void continueFromIntro()}>
              <Text>{I18n.t('common.continue')}</Text>
            </Button>
            <Button variant="ghost" onPress={onClose}>
              <Text>{I18n.t('common.not_now')}</Text>
            </Button>
          </>
        ) : null}

        {step === 'access' ? (
          <>
            <Text variant="heading" className="text-foreground">
              {I18n.t('payment_alerts.access_title')}
            </Text>
            <Text variant="body" className="text-foreground">
              {I18n.t('payment_alerts.access_body')}
            </Text>
            <View className="gap-1">
              <Text variant="bodyStrong">{I18n.t('payment_alerts.access_greyed_title')}</Text>
              <Text variant="caption" tone="muted">
                {I18n.t('payment_alerts.access_greyed_body')}
              </Text>
            </View>
            <Button onPress={openSettings}>
              <Text>{I18n.t('payment_alerts.access_open_settings')}</Text>
            </Button>
          </>
        ) : null}

        {step === 'apps' ? (
          <>
            <Text variant="heading" className="text-foreground">
              {I18n.t('payment_alerts.apps_title')}
            </Text>
            <AppPickerList
              selected={selected}
              onToggle={toggleApp}
              renderSelectedDetail={(app) => {
                const source = findAlertSource(prefs, 'android_notification', app.package);
                if (!source) return null;
                return (
                  <PaysFromControl
                    accountId={source.accountId}
                    onChange={(accountId) => setBinding(source, accountId)}
                  />
                );
              }}
            />
            <Button
              disabled={
                selected.size === 0 ||
                androidSources
                  .filter((source) => source.enabled)
                  .some(
                    (source) =>
                      !accounts.some(
                        (account) => account.id === source.accountId && isPayableAccount(account),
                      ),
                  )
              }
              onPress={finishApps}
            >
              <Text>{I18n.t('common.continue')}</Text>
            </Button>
          </>
        ) : null}

        {step === 'test' ? (
          <>
            <Text variant="heading" className="text-foreground">
              {I18n.t('payment_alerts.test_title')}
            </Text>
            <Text variant="caption" tone="muted">
              {I18n.t('payment_alerts.test_body')}
            </Text>
            {testState === 'done' && testResult ? (
              <View className="gap-1 rounded-2xl border border-success/40 bg-success/10 p-4">
                <Text variant="bodyStrong" className="text-foreground">
                  {I18n.t('payment_alerts.test_success')}
                </Text>
                {testResult.wouldLog && testResult.amount !== null ? (
                  <Text variant="body" className="text-foreground">
                    {I18n.t(
                      testCategory
                        ? 'payment_alerts.test_would_log'
                        : 'payment_alerts.test_would_log_no_category',
                      {
                        amount: formatAmount(
                          testResult.amount,
                          { ...settings, displayMode: 'money' },
                          {
                            currencyCode: testResult.currency ?? settings.currencyCode,
                          },
                        ),
                        account: testAccount?.name ?? I18n.t('transactions.editor.choose_account'),
                        category: testCategory?.name ?? '',
                      },
                    )}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {testState === 'timeout' ? (
              <View className="gap-1 rounded-2xl border border-warning/40 bg-warning/10 p-4">
                <Text variant="bodyStrong" className="text-foreground">
                  {I18n.t('payment_alerts.test_timeout_title')}
                </Text>
                <Text variant="caption" tone="muted">
                  {I18n.t('payment_alerts.test_timeout_body')}
                </Text>
              </View>
            ) : null}
            {/* The variant flips once the test lands: a key per variant remounts the
                button, since NativeWind cannot add the new variant's shadow styles to a
                mounted one (in development it throws trying to print a warning). */}
            <Button
              key={testState === 'done' ? 'send-again' : 'send'}
              variant={testState === 'done' ? 'secondary' : 'default'}
              disabled={testState === 'waiting'}
              onPress={() => void sendTest()}
            >
              <Text>
                {testState === 'waiting'
                  ? I18n.t('payment_alerts.test_waiting')
                  : I18n.t('payment_alerts.test_send')}
              </Text>
            </Button>
            <Button
              key={testState === 'done' ? 'done-primary' : 'done'}
              variant={testState === 'done' ? 'default' : 'ghost'}
              onPress={onClose}
            >
              <Text>{I18n.t('common.done')}</Text>
            </Button>
          </>
        ) : null}
      </ScrollView>
    </SettingsPageLayout>
  );
}
