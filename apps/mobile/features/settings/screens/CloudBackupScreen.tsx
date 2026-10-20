import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { ImportingOverlay } from '~/components/feedback/ImportingOverlay';
import {
  Button,
  Card,
  CardContent,
  ClayIcon,
  Input,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { registerBackgroundTask } from '~/services/autoBackup';
import {
  CloudBackupError,
  type CloudBackupStatus,
  deleteCloudAccount,
  deleteCloudBackup,
  getSignedInEmail,
  makeThisPhonePrimary,
  previewCloudBackup,
  refreshCloudStatus,
  restoreCloudBackupJson,
  runCloudBackupIfDue,
  sendSignInCode,
  signInWithCode,
  signInWithGoogleAccount,
  signOutOfCloud,
  WEB_DASHBOARD_URL,
} from '~/services/cloudBackup';
import { triggerHaptic } from '~/services/haptics';

interface CloudBackupScreenProps {
  onBack: () => void;
}

function errorMessage(error: unknown): string {
  const code = error instanceof CloudBackupError ? error.code : 'server';
  return I18n.t(`cloud_backup.errors.${code}`, {
    defaultValue: I18n.t('cloud_backup.errors.server'),
  });
}

function formatWhen(value: string | number | null | undefined): string {
  if (value == null) return I18n.t('cloud_backup.never');
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? I18n.t('cloud_backup.never')
    : date.toLocaleString(I18n.locale);
}

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Settings → Cloud Backup & Web Dashboard. Signing in turns on a daily,
 * compressed backup from this phone (when it is the account's primary device)
 * and lets app.money2time.com show it, read only. The phone stays the source of
 * truth: nothing syncs between phones, and a restore only ever happens when the
 * user asks for it here.
 */
export function CloudBackupScreen({ onBack }: CloudBackupScreenProps) {
  const { refreshAll } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CloudBackupStatus | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setProblem(null);
    const signedInEmail = await getSignedInEmail();
    setSignedIn(Boolean(signedInEmail));
    if (!signedInEmail) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      setStatus(await refreshCloudStatus());
    } catch (error) {
      if (error instanceof CloudBackupError && error.code === 'unauthenticated') {
        setSignedIn(false);
        setStatus(null);
      } else {
        setProblem(errorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const afterSignIn = async () => {
    void triggerHaptic('success');
    // Daily backups need the background task even when auto-backup is off.
    void registerBackgroundTask();
    setCode('');
    setCodeSent(false);
    await reload();
    // The first backup goes up straight away rather than tomorrow.
    void runCloudBackupIfDue({ force: true, trigger: 'automatic' })
      .then(() => reload())
      .catch(() => undefined);
  };

  const handleGoogle = () =>
    run('google', async () => {
      await signInWithGoogleAccount();
      await afterSignIn();
    });

  const handleSendCode = () =>
    run('send', async () => {
      const address = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        setProblem(I18n.t('cloud_backup.errors.invalid_email'));
        return;
      }
      await sendSignInCode(address);
      setCodeSent(true);
    });

  const handleVerify = () =>
    run('verify', async () => {
      await signInWithCode(email.trim(), code.trim());
      await afterSignIn();
    });

  const handleBackUpNow = () =>
    run('backup', async () => {
      await runCloudBackupIfDue({ force: true, trigger: 'manual' });
      void triggerHaptic('success');
      await reload();
    });

  const handleMakePrimary = () => {
    Alert.alert(I18n.t('cloud_backup.transfer_title'), I18n.t('cloud_backup.transfer_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('cloud_backup.transfer_action'),
        onPress: () =>
          void run('primary', async () => {
            await makeThisPhonePrimary();
            await reload();
          }),
      },
    ]);
  };

  const handleRestore = () =>
    run('restore', async () => {
      const preview = await previewCloudBackup();
      Alert.alert(
        I18n.t('cloud_backup.restore_title'),
        `${formatWhen(preview.meta.createdAt)}\n${I18n.t('cloud_backup.restore_summary', {
          accounts: preview.summary.accountCount,
          transactions: preview.summary.transactionCount,
        })}\n\n${I18n.t('cloud_backup.restore_warning')}`,
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('cloud_backup.restore_action'),
            style: 'destructive',
            onPress: () => {
              setRestoring(true);
              // Let the overlay paint before the import blocks the JS thread.
              setTimeout(() => {
                const result = restoreCloudBackupJson(preview.json);
                setRestoring(false);
                if (result.success) {
                  refreshAll();
                  void triggerHaptic('success');
                  Alert.alert(
                    I18n.t('cloud_backup.restore_done_title'),
                    I18n.t('cloud_backup.restore_done_message'),
                  );
                } else {
                  Alert.alert(I18n.t('cloud_backup.restore_failed_title'), result.error ?? '');
                }
              }, 50);
            },
          },
        ],
      );
    });

  const handleDeleteBackup = () => {
    Alert.alert(I18n.t('cloud_backup.delete_title'), I18n.t('cloud_backup.delete_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('cloud_backup.delete_action'),
        style: 'destructive',
        onPress: () =>
          void run('delete', async () => {
            await deleteCloudBackup();
            await reload();
          }),
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert(I18n.t('cloud_backup.sign_out_title'), I18n.t('cloud_backup.sign_out_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('cloud_backup.sign_out'),
        onPress: () =>
          void run('signout', async () => {
            await signOutOfCloud();
            await reload();
          }),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      I18n.t('cloud_backup.delete_account_title'),
      I18n.t('cloud_backup.delete_account_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('cloud_backup.delete_account_action'),
          style: 'destructive',
          onPress: () =>
            void run('account', async () => {
              await deleteCloudAccount();
              await reload();
            }),
        },
      ],
    );
  };

  const openWeb = () => {
    void trackEvent(AnalyticsEvents.WEB_DASHBOARD_OPENED);
    void Linking.openURL(WEB_DASHBOARD_URL);
  };

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('cloud_backup.title')}
          infoTooltip={I18n.t('cloud_backup.subtitle')}
        />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <CardContent className="py-5 gap-3">
            <View style={styles.introRow}>
              <ClayIcon name="status/cloud-upload" size={44} flatSize={28} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{I18n.t('cloud_backup.intro_title')}</Text>
                <Text variant="caption" tone="muted" className="mt-1">
                  {I18n.t('cloud_backup.intro_body')}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="secondary">
              {I18n.t('cloud_backup.source_of_truth')}
            </Text>
          </CardContent>
        </Card>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : !signedIn ? (
          <Card className="mt-4">
            <CardContent className="py-5 gap-4">
              <Text variant="heading">{I18n.t('cloud_backup.sign_in_title')}</Text>
              <Button variant="outline" onPress={handleGoogle} disabled={Boolean(busy)}>
                <Text>
                  {busy === 'google'
                    ? I18n.t('cloud_backup.working')
                    : I18n.t('cloud_backup.google')}
                </Text>
              </Button>
              <Text variant="caption" tone="muted" className="text-center">
                {I18n.t('cloud_backup.or')}
              </Text>
              {!codeSent ? (
                <>
                  <Input
                    label={I18n.t('cloud_backup.email_label')}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="you@example.com"
                  />
                  <Button onPress={handleSendCode} disabled={Boolean(busy)}>
                    <Text>
                      {busy === 'send'
                        ? I18n.t('cloud_backup.working')
                        : I18n.t('cloud_backup.send_code')}
                    </Text>
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    label={I18n.t('cloud_backup.code_label', { email: email.trim() })}
                    value={code}
                    onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    placeholder="000000"
                  />
                  <Button onPress={handleVerify} disabled={Boolean(busy) || code.length !== 6}>
                    <Text>
                      {busy === 'verify'
                        ? I18n.t('cloud_backup.working')
                        : I18n.t('cloud_backup.verify')}
                    </Text>
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => setCodeSent(false)}>
                    <Text>{I18n.t('cloud_backup.change_email')}</Text>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : status ? (
          <>
            <Card className="mt-4">
              <CardContent className="py-5 gap-3">
                <Text variant="caption" tone="muted">
                  {I18n.t('cloud_backup.signed_in_as', { email: status.user.email })}
                </Text>
                <View style={styles.statusRow}>
                  <ClayIcon
                    name={status.isPrimary ? 'status/success' : 'settings/data-management'}
                    size={32}
                    flatSize={22}
                  />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">
                      {status.isPrimary
                        ? I18n.t('cloud_backup.primary_yes')
                        : I18n.t('cloud_backup.primary_no')}
                    </Text>
                    <Text variant="caption" tone="muted" className="mt-0.5">
                      {status.isPrimary
                        ? I18n.t('cloud_backup.primary_yes_body')
                        : I18n.t('cloud_backup.primary_no_body', {
                            device:
                              status.primaryDevice?.name ?? I18n.t('cloud_backup.another_phone'),
                          })}
                    </Text>
                  </View>
                </View>
                {status.isPrimary ? (
                  <Button onPress={handleBackUpNow} disabled={Boolean(busy)}>
                    <Text>
                      {busy === 'backup'
                        ? I18n.t('cloud_backup.backing_up')
                        : I18n.t('cloud_backup.back_up_now')}
                    </Text>
                  </Button>
                ) : (
                  <Button variant="outline" onPress={handleMakePrimary} disabled={Boolean(busy)}>
                    <Text>{I18n.t('cloud_backup.transfer_action')}</Text>
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="py-5 gap-2">
                <Text variant="bodyStrong">{I18n.t('cloud_backup.latest_title')}</Text>
                {status.backup ? (
                  <Text variant="caption" tone="muted">
                    {I18n.t('cloud_backup.latest_body', {
                      date: formatWhen(status.backup.createdAt),
                      size: formatSize(status.backup.size),
                      device:
                        status.devices.find((d) => d.id === status.backup?.deviceId)?.name ??
                        I18n.t('cloud_backup.another_phone'),
                    })}
                  </Text>
                ) : (
                  <Text variant="caption" tone="muted">
                    {I18n.t('cloud_backup.latest_none')}
                  </Text>
                )}
                {status.lastError ? (
                  <Text variant="caption" tone="error">
                    {I18n.t(`cloud_backup.errors.${status.lastError}`, {
                      defaultValue: I18n.t('cloud_backup.errors.server'),
                    })}
                  </Text>
                ) : null}
                <Button variant="secondary" className="mt-2" onPress={openWeb}>
                  <Text>{I18n.t('cloud_backup.open_web')}</Text>
                </Button>
                <Text variant="caption" tone="muted" className="text-center">
                  {I18n.t('cloud_backup.open_web_hint')}
                </Text>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="py-5 gap-2">
                <Text variant="bodyStrong">{I18n.t('cloud_backup.restore_section')}</Text>
                <Text variant="caption" tone="muted">
                  {I18n.t('cloud_backup.restore_hint')}
                </Text>
                <Button
                  variant="outline"
                  onPress={handleRestore}
                  disabled={Boolean(busy) || !status.backup}
                >
                  <Text>
                    {busy === 'restore'
                      ? I18n.t('cloud_backup.working')
                      : I18n.t('cloud_backup.restore_action')}
                  </Text>
                </Button>
              </CardContent>
            </Card>

            <View style={styles.footerActions}>
              {status.backup ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={handleDeleteBackup}
                  disabled={Boolean(busy)}
                >
                  <Text>{I18n.t('cloud_backup.delete_action')}</Text>
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onPress={handleSignOut} disabled={Boolean(busy)}>
                <Text>{I18n.t('cloud_backup.sign_out')}</Text>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onPress={handleDeleteAccount}
                disabled={Boolean(busy)}
              >
                <Text className="text-destructive">
                  {I18n.t('cloud_backup.delete_account_action')}
                </Text>
              </Button>
            </View>
          </>
        ) : null}

        {problem ? (
          <Text variant="caption" tone="error" className="mt-4 text-center">
            {problem}
          </Text>
        ) : null}
      </ScrollView>
      <ImportingOverlay visible={restoring} title={I18n.t('cloud_backup.restoring')} />
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING },
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  footerActions: { marginTop: 16, alignItems: 'center', gap: 4 },
});
