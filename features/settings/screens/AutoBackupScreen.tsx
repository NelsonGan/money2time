import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  HardDrive,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { ImportingOverlay } from '~/components/feedback/ImportingOverlay';
import {
  Button,
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { getErrorMessage } from '~/utils/errorHandling';
import {
  type BackupRecord,
  deleteBackup,
  ensureGoogleSession,
  getGoogleAccountEmail,
  isGoogleDriveConfigured,
  isTargetAvailable,
  listAllBackups,
  previewBackup,
  restoreFromBackup,
  runAutoBackupIfDue,
  signInWithGoogle,
  signOutFromGoogle,
  sortRecordsNewestFirst,
} from '~/services/autoBackup';
import { triggerHaptic } from '~/services/haptics';
import type { BackupTarget } from '~/types';

interface AutoBackupScreenProps {
  onBack: () => void;
}

const ALL_TARGETS: BackupTarget[] = ['local', 'icloud', 'googleDrive'];

function targetLabel(target: BackupTarget): string {
  switch (target) {
    case 'local':
      return I18n.t('auto_backup.target.local');
    case 'icloud':
      return I18n.t('auto_backup.target.icloud');
    case 'googleDrive':
      return I18n.t('auto_backup.target.google_drive');
  }
}

function targetIcon(target: BackupTarget, size = 16, color?: string) {
  switch (target) {
    case 'local':
      return <Smartphone size={size} color={color} />;
    case 'icloud':
      return <Cloud size={size} color={color} />;
    case 'googleDrive':
      return <HardDrive size={size} color={color} />;
  }
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return I18n.t('auto_backup.just_now');
  if (minutes < 60) return I18n.t('auto_backup.minutes_ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return I18n.t('auto_backup.hours_ago', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return I18n.t('auto_backup.days_ago', { count: days });
  return new Date(t).toLocaleDateString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AutoBackupScreen({ onBack }: AutoBackupScreenProps) {
  const { settings, updateSettings, refreshAll, refreshSettings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();

  const [records, setRecords] = useState<BackupRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [iCloudAvailable, setICloudAvailable] = useState(false);
  const [googleUser, setGoogleUser] = useState<string | null>(null);
  const [pickingTarget, setPickingTarget] = useState<BackupTarget | null>(null);
  // Composite key (target:id) of the record currently being deleted. The row
  // greys out and shows a spinner until the network call returns and the
  // reconciling reload removes it from the list.
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  // Guard against double-tap during a backup. The service has its own re-entry
  // guard, but blocking at the UI keeps the button visibly disabled instantly.
  const inFlightRef = useRef(false);

  const reloadAvailability = useCallback(async () => {
    if (Platform.OS === 'ios') {
      setICloudAvailable(await isTargetAvailable('icloud'));
    } else {
      setICloudAvailable(false);
    }
    // Reads through a silent session restore: after an app restart the account
    // is still remembered but the native session is empty, so the synchronous
    // getter alone would report "not connected".
    setGoogleUser(await getGoogleAccountEmail());
  }, []);

  const reloadRecords = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await listAllBackups();
      setRecords(list);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reloadAvailability();
    void reloadRecords();
  }, [reloadAvailability, reloadRecords]);

  // Re-check availability when the user returns from iOS Settings (e.g. after
  // enabling iCloud Drive) or any other app. Without this, iCloudAvailable
  // stays stale at its initial value and the destination row stays "disabled".
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') return;
      void reloadAvailability();
    });
    return () => sub.remove();
  }, [reloadAvailability]);

  const handleToggle = (value: boolean) => {
    void triggerHaptic('selection');
    updateSettings({ autoBackupEnabled: value });
    void trackEvent(AnalyticsEvents.AUTO_BACKUP_SETTING_TOGGLED, { enabled: value });
  };

  const handlePickTarget = async (target: BackupTarget) => {
    if (target === settings.autoBackupTarget) return;
    if (pickingTarget) return;
    void triggerHaptic('selection');
    setPickingTarget(target);
    // Yield so the spinner paints before we call into the native iCloud / OAuth
    // bridges, which can take 500ms+ to resolve.
    await new Promise<void>((resolve) => setTimeout(resolve, 16));

    try {
      if (target === 'icloud') {
        if (Platform.OS !== 'ios') {
          Alert.alert(I18n.t('auto_backup.icloud_unavailable_title'));
          return;
        }
        const ok = await isTargetAvailable('icloud');
        if (!ok) {
          Alert.alert(
            I18n.t('auto_backup.icloud_unavailable_title'),
            I18n.t('auto_backup.icloud_unavailable_message'),
          );
          return;
        }
      }

      if (target === 'googleDrive') {
        if (!isGoogleDriveConfigured()) {
          Alert.alert(
            I18n.t('auto_backup.google_drive_unconfigured_title'),
            I18n.t('auto_backup.google_drive_unconfigured_message'),
          );
          return;
        }
        // A remembered account whose session can no longer be restored (access
        // revoked, expired credential) needs the interactive flow again.
        if (!(await ensureGoogleSession())) {
          const result = await signInWithGoogle();
          if (!result.ok) {
            if (result.reason !== 'cancelled') {
              Alert.alert(
                I18n.t('auto_backup.google_drive_sign_in_failed_title'),
                result.message ?? '',
              );
            }
            return;
          }
          setGoogleUser(result.email);
        }
      }

      updateSettings({ autoBackupTarget: target });
      void trackEvent(AnalyticsEvents.AUTO_BACKUP_TARGET_CHANGED, { target });
      // Fire-and-forget the list reload — switching destination shouldn't
      // block the UI on a network round-trip.
      void reloadRecords();
    } finally {
      setPickingTarget(null);
    }
  };

  const handleSignOutGoogle = () => {
    void triggerHaptic('selection');
    Alert.alert(
      I18n.t('auto_backup.google_drive_sign_out_title'),
      I18n.t('auto_backup.google_drive_sign_out_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('auto_backup.google_drive_sign_out_action'),
          style: 'destructive',
          onPress: async () => {
            await signOutFromGoogle();
            setGoogleUser(null);
            if (settings.autoBackupTarget === 'googleDrive') {
              updateSettings({ autoBackupTarget: 'local' });
            }
            await reloadRecords();
          },
        },
      ],
    );
  };

  // Recovery path from the "saved on this device" alert: re-run the connection
  // step for the destination we couldn't reach and refresh the listing.
  const handleReconnectTarget = async (target: BackupTarget) => {
    if (target === 'googleDrive') {
      const result = await signInWithGoogle();
      if (!result.ok) {
        if (result.reason !== 'cancelled') {
          Alert.alert(
            I18n.t('auto_backup.google_drive_sign_in_failed_title'),
            result.message ?? '',
          );
        }
        return;
      }
      setGoogleUser(result.email);
      void reloadRecords();
      return;
    }
    if (target === 'icloud') {
      if (await isTargetAvailable('icloud')) {
        setICloudAvailable(true);
        void reloadRecords();
        return;
      }
      Alert.alert(
        I18n.t('auto_backup.icloud_unavailable_title'),
        I18n.t('auto_backup.icloud_unavailable_message'),
      );
    }
  };

  const handleBackupNow = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBackingUp(true);
    // Yield one frame so React paints the "Backing up..." state before the
    // sync SQLite reads + JSON.stringify block the thread. Without this, the
    // button doesn't update visually until everything is finished.
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
    try {
      const result = await runAutoBackupIfDue({ force: true });
      if (result.fellBackToLocalFrom) {
        // The backup was saved on the device because the cloud target was
        // unreachable. Say so explicitly and offer to reconnect, rather than
        // letting a local row masquerade as a cloud backup.
        const target = result.fellBackToLocalFrom;
        Alert.alert(
          I18n.t('auto_backup.fallback_local_title'),
          I18n.t('auto_backup.fallback_local_message', { target: targetLabel(target) }),
          [
            { text: I18n.t('common.not_now'), style: 'cancel' },
            {
              text: I18n.t('auto_backup.fallback_local_reconnect'),
              onPress: () => {
                void handleReconnectTarget(target);
              },
            },
          ],
        );
      } else if (result.errors.length > 0) {
        Alert.alert(I18n.t('auto_backup.backup_partial_title'), result.errors.join('\n'));
      } else if (!result.skipped && result.written.length > 0) {
        void triggerHaptic('success');
      }
      // Optimistically prepend the just-written records so the list updates
      // immediately. The full reconciliation runs in the background (cloud
      // providers can be slow over the network and we don't want to block).
      if (result.written.length > 0) {
        setRecords((prev) => {
          const existingIds = new Set(prev.map((r) => `${r.target}:${r.id}`));
          const fresh = result.written.filter((r) => !existingIds.has(`${r.target}:${r.id}`));
          return sortRecordsNewestFirst([...fresh, ...prev]);
        });
      }
      // Lightweight settings reload (just lastAutoBackupAt) instead of the
      // full refreshAll which re-reads every table.
      refreshSettings();
      // Fire-and-forget reconciliation against cloud/local listings.
      void reloadRecords();
    } finally {
      inFlightRef.current = false;
      setBackingUp(false);
    }
  };

  const handleRowPress = (record: BackupRecord) => {
    void triggerHaptic('selection');
    Alert.alert(
      formatRelative(record.createdAt),
      `${targetLabel(record.target)} · ${formatSize(record.sizeBytes)}`,
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('auto_backup.delete_action'),
          style: 'destructive',
          onPress: () => confirmDelete(record),
        },
        {
          text: I18n.t('auto_backup.restore_action'),
          style: 'default',
          onPress: () => confirmRestore(record),
        },
      ],
    );
  };

  const confirmDelete = (record: BackupRecord) => {
    Alert.alert(
      I18n.t('auto_backup.delete_confirm_title'),
      I18n.t('auto_backup.delete_confirm_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('auto_backup.delete_action'),
          style: 'destructive',
          onPress: () => void performDelete(record),
        },
      ],
    );
  };

  const performDelete = async (record: BackupRecord) => {
    const key = `${record.target}:${record.id}`;
    setDeletingKey(key);
    try {
      await deleteBackup(record);
      // Remove from the local list immediately; the reconciling reload runs
      // afterward to catch any provider-side drift.
      setRecords((prev) => prev.filter((r) => `${r.target}:${r.id}` !== key));
      void reloadRecords();
    } catch (e) {
      Alert.alert(
        I18n.t('auto_backup.delete_failed_title'),
        getErrorMessage(e, I18n.t('errors.generic_operation_failed')),
      );
    } finally {
      setDeletingKey((current) => (current === key ? null : current));
    }
  };

  const confirmRestore = async (record: BackupRecord) => {
    let summaryLine = '';
    try {
      const summary = await previewBackup(record);
      if (summary) {
        summaryLine = I18n.t('auto_backup.restore_confirm_summary', {
          accounts: summary.accountCount,
          transactions: summary.transactionCount,
        });
      }
    } catch {
      // Preview failed; fall back to plain confirmation.
    }

    Alert.alert(
      I18n.t('auto_backup.restore_confirm_title'),
      `${formatRelative(record.createdAt)}\n${summaryLine}\n\n${I18n.t('auto_backup.restore_confirm_warning')}`.trim(),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('auto_backup.restore_confirm_action'),
          style: 'destructive',
          onPress: () => void performRestore(record),
        },
      ],
    );
  };

  const performRestore = async (record: BackupRecord) => {
    setRestoring(true);
    try {
      const result = await restoreFromBackup(record);
      if (result.success) {
        refreshAll();
        void triggerHaptic('success');
        Alert.alert(
          I18n.t('auto_backup.restore_success_title'),
          I18n.t('auto_backup.restore_success_message'),
        );
      } else {
        Alert.alert(
          I18n.t('auto_backup.restore_failed_title'),
          result.error ?? I18n.t('errors.import_failed_generic'),
        );
      }
    } finally {
      setRestoring(false);
    }
  };

  const lastBackupText = settings.lastAutoBackupAt
    ? I18n.t('auto_backup.last_backup', { relative: formatRelative(settings.lastAutoBackupAt) })
    : I18n.t('auto_backup.last_backup_never');

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('auto_backup.title')}
          infoTooltip={I18n.t('auto_backup.subtitle')}
        />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <Card>
          <CardContent className="py-5 gap-5">
            {/* Toggle */}
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="caption" className="text-foreground">
                  {I18n.t('auto_backup.toggle_label')}
                </Text>
                <Text variant="caption" tone="muted" className="mt-0.5">
                  {lastBackupText}
                </Text>
                {settings.lastAutoBackupError ? (
                  <View style={styles.errorRow}>
                    <View style={styles.errorIconWrap}>
                      <AlertTriangle size={13} color={themeColors.coral} />
                    </View>
                    <Text
                      variant="caption"
                      style={[styles.errorText, { color: themeColors.coral }]}
                    >
                      {settings.lastAutoBackupError}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Switch
                value={settings.autoBackupEnabled}
                onValueChange={handleToggle}
                trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <View style={styles.divider} />

            {/* Destination */}
            <View>
              <Text variant="caption" className="text-foreground mb-2">
                {I18n.t('auto_backup.destination_label')}
              </Text>
              <View style={styles.targetList}>
                {ALL_TARGETS.map((target) => {
                  if (target === 'icloud' && Platform.OS !== 'ios') return null;
                  const selected = settings.autoBackupTarget === target;
                  const disabled =
                    (target === 'icloud' && !iCloudAvailable) ||
                    (target === 'googleDrive' && !isGoogleDriveConfigured());
                  const isPicking = pickingTarget === target;
                  return (
                    <Pressable
                      key={target}
                      onPress={() => void handlePickTarget(target)}
                      disabled={(disabled && !selected) || pickingTarget !== null}
                      style={[
                        styles.targetRow,
                        {
                          borderColor: selected ? themeColors.primary : `${themeColors.border}60`,
                          backgroundColor: selected ? `${themeColors.primary}10` : 'transparent',
                          opacity:
                            (disabled && !selected) ||
                            (pickingTarget !== null && !isPicking && !selected)
                              ? 0.55
                              : 1,
                        },
                      ]}
                    >
                      {targetIcon(target, 18, selected ? themeColors.primary : themeColors.muted)}
                      <View style={styles.targetTextWrap}>
                        <Text variant="caption" className="text-foreground">
                          {targetLabel(target)}
                        </Text>
                        {target === 'icloud' && !iCloudAvailable ? (
                          <Text variant="caption" tone="muted" className="mt-0.5">
                            {I18n.t('auto_backup.icloud_unavailable_short')}
                          </Text>
                        ) : null}
                        {target === 'googleDrive' && googleUser ? (
                          <Text variant="caption" tone="muted" className="mt-0.5">
                            {googleUser}
                          </Text>
                        ) : null}
                        {target === 'googleDrive' && !isGoogleDriveConfigured() ? (
                          <Text variant="caption" tone="muted" className="mt-0.5">
                            {I18n.t('auto_backup.google_drive_unconfigured_short')}
                          </Text>
                        ) : null}
                      </View>
                      {isPicking ? (
                        <ActivityIndicator size="small" color={themeColors.primary} />
                      ) : target === 'googleDrive' && googleUser ? (
                        // Nested Pressable for sign-out. React Native's
                        // responder model only fires onPress on the topmost
                        // responder, so tapping this button does NOT also
                        // trigger the outer row's onPress. Hit slop enlarges
                        // the tap target without bloating the visual size.
                        <Pressable
                          onPress={handleSignOutGoogle}
                          hitSlop={10}
                          style={[
                            styles.targetTrailingButton,
                            { backgroundColor: `${themeColors.muted}1A` },
                          ]}
                          accessibilityLabel={I18n.t('auto_backup.google_drive_sign_out_link')}
                        >
                          <CloudOff size={14} color={themeColors.muted} />
                        </Pressable>
                      ) : selected ? (
                        <Check size={16} color={themeColors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Manual backup */}
            <Button
              variant="outline"
              onPress={() => void handleBackupNow()}
              disabled={backingUp || restoring || pickingTarget !== null}
            >
              <View style={styles.buttonInner}>
                {backingUp ? <ActivityIndicator size="small" color={themeColors.primary} /> : null}
                <Text>
                  {backingUp ? I18n.t('auto_backup.backing_up') : I18n.t('auto_backup.back_up_now')}
                </Text>
              </View>
            </Button>
          </CardContent>
        </Card>

        {/* Backup list */}
        <View style={styles.listHeader}>
          <Text variant="caption" tone="muted">
            {I18n.t('auto_backup.list_title')}
          </Text>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              void reloadRecords();
            }}
            disabled={refreshing}
          >
            <RefreshCw size={14} color={themeColors.muted} />
          </Pressable>
        </View>

        {records.length === 0 ? (
          <Card>
            <CardContent>
              <View style={styles.emptyState}>
                <Text variant="caption" tone="muted" className="text-center">
                  {I18n.t('auto_backup.empty_state')}
                </Text>
              </View>
            </CardContent>
          </Card>
        ) : (
          <View style={styles.recordList}>
            {records.map((record) => {
              const key = `${record.target}:${record.id}`;
              const isDeleting = deletingKey === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => handleRowPress(record)}
                  disabled={isDeleting}
                  style={[
                    styles.recordRow,
                    {
                      backgroundColor: themeColors.card,
                      borderColor: isDeleting
                        ? `${themeColors.coral}55`
                        : `${themeColors.border}55`,
                      opacity: isDeleting ? 0.55 : 1,
                    },
                  ]}
                >
                  <View
                    style={[styles.recordIcon, { backgroundColor: `${themeColors.primary}14` }]}
                  >
                    {targetIcon(record.target, 18, themeColors.primary)}
                  </View>
                  <View style={styles.recordText}>
                    <Text variant="caption" className="text-foreground">
                      {formatRelative(record.createdAt)}
                    </Text>
                    <Text variant="caption" tone="muted" className="mt-0.5">
                      {targetLabel(record.target)} · {formatSize(record.sizeBytes)}
                    </Text>
                  </View>
                  {isDeleting ? (
                    <ActivityIndicator size="small" color={themeColors.coral} />
                  ) : (
                    <Trash2 size={15} color={themeColors.muted} />
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <ImportingOverlay visible={restoring} title={I18n.t('auto_backup.restoring')} />
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowText: {
    flex: 1,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 6,
  },
  // Match the icon's optical center to the cap-height of the first line of
  // text. Without this the icon visually floats above the text baseline.
  errorIconWrap: {
    height: 18,
    justifyContent: 'center',
  },
  errorText: {
    flex: 1,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  targetList: {
    gap: 8,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  targetTextWrap: {
    flex: 1,
  },
  targetTrailingButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 2,
    marginBottom: -2,
  },
  emptyState: {
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  // Standalone card-like rows on the page background — no outer Card wrapper.
  recordList: {
    gap: 1,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  recordIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordText: {
    flex: 1,
  },
});
