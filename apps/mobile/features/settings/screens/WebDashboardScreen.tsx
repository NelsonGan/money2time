import { useIsFocused } from '@react-navigation/native';
import { CircleCheck, Ellipsis, ExternalLink, RefreshCw, ScanQrCode } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

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
import { usePro } from '~/context/ProContext';
import { QrScannerView } from '~/features/settings/components/QrScannerView';
import { whenAppUnlocked } from '~/features/settings/lib/appLockState';
import { useWebDashboardEditor } from '~/features/settings/lib/useWebDashboardEditor';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import {
  beginLink,
  isWebDashboardAvailable,
  type LinkedBrowser,
  listLinkedBrowsers,
  MAX_LINKED_BROWSERS,
  setBrowserEdits,
  unlinkBrowserOffline,
  WEB_DASHBOARD_URL,
  WebDashboardConnections,
  WebDashboardError,
  type WebDashboardStatus,
} from '~/services/webDashboard';

interface WebDashboardScreenProps {
  onBack: () => void;
  /** A `money2time://pair?…` link the system camera opened the app with. */
  initialPairLink?: string;
}

/**
 * The screen can be open twice: in Settings, and again on top of it from a
 * scanned `money2time://pair` link. Two seats in one room would keep replacing
 * each other, so only the topmost screen holds them; the one beneath takes
 * them back when the top one closes.
 */
type SeatHolder = { pause: () => void; resume: () => void };
const seatHolders: SeatHolder[] = [];

function errorMessage(error: unknown): string {
  const code = error instanceof WebDashboardError ? error.code : 'failed';
  return I18n.t(`web_dashboard.errors.${code}`, {
    max: MAX_LINKED_BROWSERS,
    defaultValue: I18n.t('web_dashboard.errors.failed'),
  });
}

/** How long ago, as short as a badge allows: "now", "4m", "3h", "2d". */
function formatAge(value: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - value) / 60_000));
  if (minutes < 1) return I18n.t('web_dashboard.just_now');
  const [amount, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : minutes < 60 * 24
        ? [Math.floor(minutes / 60), 'hour']
        : [Math.floor(minutes / (60 * 24)), 'day'];
  return new Intl.NumberFormat(I18n.locale, { style: 'unit', unit, unitDisplay: 'narrow' }).format(
    amount,
  );
}

/** The browser's state in a word or two. */
function statusLine(status: WebDashboardStatus[string] | undefined): string {
  const state = status?.state ?? 'connecting';
  if (state === 'sending') {
    return I18n.t('web_dashboard.status_sending', {
      percent: Math.round((status?.progress ?? 0) * 100),
    });
  }
  return I18n.t(
    state === 'online'
      ? 'web_dashboard.status_open'
      : state === 'connecting'
        ? 'web_dashboard.status_connecting'
        : 'web_dashboard.status_closed',
  );
}

/**
 * Settings → Web Dashboard. Links a computer's browser by scanning the QR
 * code app.money2time.com shows, then, while this screen is open, sends the
 * latest data straight to every linked browser that is open: end-to-end
 * encrypted, through a relay that stores nothing. Opening this screen is how
 * the dashboard refreshes. The phone stays the source of truth: a linked
 * browser can change entries only while this screen is open, and each change
 * is checked here and saved through AppContext like one made in the app.
 */
export function WebDashboardScreen({ onBack, initialPairLink }: WebDashboardScreenProps) {
  const colors = useThemeColors();
  const isFocused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const bottomNavInset = useSettingsBottomNavInset();
  const { isPro, isStatusKnown } = usePro();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [links, setLinks] = useState<LinkedBrowser[]>([]);
  const [status, setStatus] = useState<WebDashboardStatus>({});
  const [linking, setLinking] = useState(false);
  // The camera opens only when the person asks to link a device, and closes
  // once that attempt is over.
  const [scanning, setScanning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const connections = useRef<WebDashboardConnections | null>(null);
  // A manager made later (back from the background) starts with today's Pro.
  const isProRef = useRef(isPro);
  // Until RevenueCat has answered, `isPro` is a placeholder `false`: a browser
  // that asks meanwhile is answered once it has.
  const proKnownRef = useRef(isStatusKnown);
  const openRef = useRef<() => void>(() => undefined);
  const pairHandled = useRef(false);
  // Saves a linked browser's changes; the connections keep it for the screen's life.
  const editor = useWebDashboardEditor(() => {
    const saved = I18n.t('web_dashboard.edit_saved');
    setProblem(null);
    setNotice(saved);
    setTimeout(() => setNotice((current) => (current === saved ? null : current)), 4000);
  });

  const reloadLinks = useCallback(async () => {
    setLinks(await listLinkedBrowsers());
    await connections.current?.sync();
  }, []);

  // A seat in every linked browser's room for as long as this screen is open
  // and the app is in the foreground.
  useEffect(() => {
    let active = true;
    const holder: SeatHolder = {
      pause: () => close(),
      resume: () => {
        if (usable && proKnownRef.current && AppState.currentState === 'active') open();
      },
    };
    seatHolders.at(-1)?.pause();
    seatHolders.push(holder);
    const open = () => {
      if (connections.current || seatHolders.at(-1) !== holder) return;
      const manager = new WebDashboardConnections({
        isPro: isProRef.current,
        onChange: (next) => active && setStatus(next),
        onLinksChanged: () => {
          if (active) void listLinkedBrowsers().then(setLinks, () => undefined);
        },
        onSendFailed: (error) => active && setProblem(errorMessage(error)),
        editor,
      });
      connections.current = manager;
      void manager.sync().catch(() => undefined);
    };
    const close = () => {
      connections.current?.close();
      connections.current = null;
      setStatus({});
    };
    let usable = false;
    void isWebDashboardAvailable().then((yes) => {
      if (!active) return;
      usable = yes;
      setAvailable(yes);
      if (!yes) return;
      void listLinkedBrowsers().then(
        (list) => {
          if (!active) return;
          setLinks(list);
        },
        () => undefined,
      );
      if (proKnownRef.current) open();
    });
    // Only a real trip to the background closes the seats: iOS goes
    // `inactive` for the camera prompt, Face ID and Control Center too.
    const subscription = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
      if (state === 'active' && usable && proKnownRef.current) {
        void listLinkedBrowsers().then(
          (list) => active && setLinks(list),
          () => undefined,
        );
        open();
      } else if (state === 'background') {
        close();
      }
    });
    openRef.current = () => {
      if (usable) open();
    };
    return () => {
      active = false;
      subscription.remove();
      close();
      const wasTop = seatHolders.at(-1) === holder;
      seatHolders.splice(seatHolders.indexOf(holder), 1);
      if (wasTop) seatHolders.at(-1)?.resume();
    };
    // Opened once per visit; Pro changes are passed on below. `editor` never changes.
  }, [editor]);

  // Leaving the screen puts the camera away. In the background it only
  // pauses (`foreground`): Android reports the camera permission dialog as
  // the app going to the background, and closing here would close the very
  // camera the person just allowed.
  useEffect(() => {
    if (!isFocused) setScanning(false);
  }, [isFocused]);

  useEffect(() => {
    isProRef.current = isPro;
    connections.current?.setPro(isPro);
  }, [isPro]);

  useEffect(() => {
    proKnownRef.current = isStatusKnown;
    if (isStatusKnown) openRef.current();
  }, [isStatusKnown]);

  const handleScanned = (text: string) => {
    setProblem(null);
    setNotice(null);
    setLinking(true);
    void beginLink(text)
      .then(async (pending) => {
        // A pairing link can arrive while the app is locked, and the alert
        // would draw above the lock screen: whoever holds the phone could
        // link their own computer. Ask only once the owner has unlocked.
        await whenAppUnlocked();
        // Nothing is linked until the person checks the code and agrees, on
        // this phone and on the computer: a code from someone else's screen
        // would send them this phone's data.
        Alert.alert(
          pending.browserName
            ? I18n.t('web_dashboard.confirm_title', { name: pending.browserName })
            : I18n.t('web_dashboard.confirm_title_unnamed'),
          `${I18n.t('web_dashboard.confirm_message', {
            code: `${pending.code.slice(0, 3)} ${pending.code.slice(3)}`,
          })}\n\n${I18n.t('web_dashboard.confirm_edits')}`,
          [
            {
              text: I18n.t('common.cancel'),
              style: 'cancel',
              onPress: () => {
                pending.cancel();
                setLinking(false);
                setScanning(false);
              },
            },
            {
              text: I18n.t('web_dashboard.confirm_action'),
              onPress: () => {
                // The computer asks too, and links only when both agree.
                setNotice(I18n.t('web_dashboard.confirm_waiting'));
                void pending
                  .confirm()
                  .then(async () => {
                    // The new row below is the confirmation.
                    void triggerHaptic('success');
                    setNotice(null);
                    await reloadLinks();
                  })
                  .catch((error: unknown) => {
                    setNotice(null);
                    setProblem(errorMessage(error));
                  })
                  .finally(() => {
                    setLinking(false);
                    setScanning(false);
                  });
              },
            },
          ],
          { cancelable: false },
        );
      })
      .catch((error: unknown) => {
        setProblem(errorMessage(error));
        setLinking(false);
        // A code that is not a pairing code: the camera stays up for the right one.
        if (!(error instanceof WebDashboardError && error.code === 'invalid_qr')) {
          setScanning(false);
        }
      });
  };

  // Opened from the system camera with a code: link it as if scanned here.
  useEffect(() => {
    if (!available || !initialPairLink || pairHandled.current) return;
    pairHandled.current = true;
    handleScanned(initialPairLink);
    // handleScanned only reads setters and the link itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, initialPairLink]);

  /** The row's menu: allow or stop this browser's changes, or unlink it. */
  const handleMenu = (link: LinkedBrowser) => {
    const name = String(link.name ?? I18n.t('web_dashboard.unknown_browser'));
    Alert.alert(name, I18n.t(link.edits ? 'web_dashboard.edits_on' : 'web_dashboard.edits_off'), [
      {
        text: I18n.t(link.edits ? 'web_dashboard.edits_disallow' : 'web_dashboard.edits_allow'),
        onPress: () => {
          void setBrowserEdits(link.roomId, !link.edits)
            .then(reloadLinks)
            // That browser gets data with (or without) a token at once.
            .then(() => connections.current?.refreshBrowser(link.roomId))
            .catch((error: unknown) => setProblem(errorMessage(error)));
        },
      },
      {
        text: I18n.t('web_dashboard.unlink'),
        style: 'destructive',
        onPress: () => handleUnlink(link),
      },
      { text: I18n.t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleUnlink = (link: LinkedBrowser) => {
    Alert.alert(
      I18n.t('web_dashboard.unlink_title'),
      I18n.t('web_dashboard.unlink_message', {
        name: link.name ?? I18n.t('web_dashboard.unknown_browser'),
      }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('web_dashboard.unlink'),
          style: 'destructive',
          onPress: () => {
            const manager = connections.current;
            const unlink = manager
              ? manager.unlink(link.roomId)
              : unlinkBrowserOffline(link.roomId).then(async () =>
                  setLinks(await listLinkedBrowsers()),
                );
            void unlink.catch((error: unknown) => setProblem(errorMessage(error)));
          },
        },
      ],
    );
  };

  const handleSendNow = () => {
    setProblem(null);
    connections.current?.sendNow();
  };

  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (links.length === 0) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [links]);

  const anyOpen = Object.values(status).some((s) => s.state === 'online');
  const anySending = Object.values(status).some((s) => s.state === 'sending');

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
          title={I18n.t('web_dashboard.title')}
          infoTooltip={I18n.t('web_dashboard.subtitle')}
        />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        keyboardShouldPersistTaps="handled"
      >
        {available === null ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : !available ? (
          <Text variant="caption" tone="error" className="mt-4 text-center">
            {I18n.t('web_dashboard.errors.unavailable')}
          </Text>
        ) : (
          <>
            <View className="items-center gap-3 pt-3">
              <Image
                source={require('../../../assets/illustrations/link-computer.png')}
                className="h-24 w-48"
                resizeMode="contain"
                accessible={false}
              />
              <Text variant="headingSm" className="text-center">
                {I18n.t('web_dashboard.link_title')}
              </Text>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onPress={openWeb}
                accessibilityLabel={I18n.t('web_dashboard.open_web')}
              >
                <Text>app.money2time.com</Text>
                <ExternalLink size={14} color={colors.primary} />
              </Button>
              {scanning ? (
                <>
                  <QrScannerView
                    active={isFocused && foreground && !linking}
                    onScanned={handleScanned}
                  />
                  <Text variant="caption" tone="muted" className="px-4 text-center">
                    {I18n.t(linking ? 'web_dashboard.linking' : 'web_dashboard.scan_hint')}
                  </Text>
                  {linking ? null : (
                    <Button variant="ghost" size="sm" onPress={() => setScanning(false)}>
                      <Text>{I18n.t('common.cancel')}</Text>
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    className="mt-1 w-full max-w-[360px] gap-2"
                    disabled={linking}
                    onPress={() => {
                      setProblem(null);
                      setNotice(null);
                      setScanning(true);
                      // The button goes away under the reader's focus: say what is next.
                      AccessibilityInfo.announceForAccessibility(I18n.t('web_dashboard.scan_hint'));
                    }}
                  >
                    <ScanQrCode size={18} color="#fff" />
                    <Text>{I18n.t('web_dashboard.link_device')}</Text>
                  </Button>
                  {linking ? (
                    <Text variant="caption" tone="muted" className="px-4 text-center">
                      {I18n.t('web_dashboard.linking')}
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            {links.length > 0 ? (
              <View className="mt-4 gap-2">
                <View className="flex-row items-center justify-between px-1">
                  <Text variant="caption" tone="muted">
                    {I18n.t('web_dashboard.browsers_title')}
                  </Text>
                  <Pressable
                    onPress={handleSendNow}
                    disabled={!anyOpen || anySending}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('web_dashboard.send_now')}
                    accessibilityState={{ disabled: !anyOpen || anySending }}
                    style={[styles.syncButton, !anyOpen && styles.dimmed]}
                  >
                    {anySending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <RefreshCw size={16} color={colors.primary} />
                    )}
                  </Pressable>
                </View>
                <Text variant="caption" tone="muted" className="px-1">
                  {I18n.t(
                    links.every((link) => link.edits)
                      ? 'web_dashboard.edit_hint'
                      : 'web_dashboard.edit_hint_some_read_only',
                  )}
                </Text>
                {links.map((link) => {
                  const state = status[link.roomId]?.state;
                  const live = state === 'online' || state === 'sending';
                  const name = link.name ?? I18n.t('web_dashboard.unknown_browser');
                  return (
                    <Card key={link.roomId} className="px-4 py-3">
                      <CardContent className="flex-row items-center gap-3">
                        <Image
                          source={require('../../../assets/illustrations/linked-computer.png')}
                          style={styles.deviceIcon}
                          accessible={false}
                        />
                        <View style={styles.flex}>
                          <Text variant="bodyStrong" numberOfLines={1}>
                            {name}
                          </Text>
                          <View className="mt-0.5 flex-row items-center gap-1.5">
                            <View
                              className={`h-2 w-2 rounded-full ${live ? 'bg-success' : 'bg-muted-foreground'}`}
                            />
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                              {statusLine(status[link.roomId])}
                              {link.edits ? '' : ` · ${I18n.t('web_dashboard.read_only')}`}
                            </Text>
                          </View>
                        </View>
                        {link.lastSentAt ? (
                          <View
                            className="flex-row items-center gap-1"
                            accessible
                            accessibilityLabel={I18n.t('web_dashboard.last_sent', {
                              date: new Date(link.lastSentAt).toLocaleString(I18n.locale),
                            })}
                          >
                            <CircleCheck size={14} color={colors.success} />
                            <Text variant="caption" tone="muted">
                              {formatAge(link.lastSentAt, now)}
                            </Text>
                          </View>
                        ) : null}
                        <Pressable
                          onPress={() => handleMenu(link)}
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={`${I18n.t('web_dashboard.browser_options')} ${name}`}
                        >
                          <Ellipsis size={20} color={colors.textMuted} />
                        </Pressable>
                      </CardContent>
                    </Card>
                  );
                })}
              </View>
            ) : null}
          </>
        )}

        {notice ? (
          <Text variant="caption" tone="success" className="mt-4 text-center">
            {notice}
          </Text>
        ) : null}
        {problem ? (
          <Text variant="caption" tone="error" className="mt-4 text-center">
            {problem}
          </Text>
        ) : null}
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING },
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  flex: { flex: 1 },
  deviceIcon: { width: 44, height: 44 },
  syncButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
  loading: { paddingVertical: 32, alignItems: 'center' },
});
