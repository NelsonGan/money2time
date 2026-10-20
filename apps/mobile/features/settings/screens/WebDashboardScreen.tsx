import { ExternalLink, Monitor, ShieldCheck } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
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
import { QrScannerModal } from '~/features/settings/components/QrScannerModal';
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

function formatWhen(value: number | null | undefined): string {
  if (value == null) return I18n.t('web_dashboard.never');
  return new Date(value).toLocaleString(I18n.locale);
}

function statusLine(link: LinkedBrowser, status: WebDashboardStatus[string] | undefined): string {
  const state = status?.state ?? 'connecting';
  if (state === 'sending') {
    return I18n.t('web_dashboard.status_sending', {
      percent: Math.round((status?.progress ?? 0) * 100),
    });
  }
  if (state === 'online') {
    return link.lastSentAt
      ? I18n.t('web_dashboard.status_open_sent', { date: formatWhen(link.lastSentAt) })
      : I18n.t('web_dashboard.status_open');
  }
  if (state === 'connecting') return I18n.t('web_dashboard.status_connecting');
  return I18n.t('web_dashboard.status_closed', { date: formatWhen(link.lastSentAt) });
}

/**
 * Settings → Web Dashboard. Links a computer's browser by scanning the QR
 * code app.money2time.com shows, then, while this screen is open, sends the
 * latest data straight to every linked browser that is open: end-to-end
 * encrypted, through a relay that stores nothing. Opening this screen is how
 * the dashboard refreshes. The phone stays the source of truth.
 */
export function WebDashboardScreen({ onBack, initialPairLink }: WebDashboardScreenProps) {
  const colors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const { isPro, isStatusKnown } = usePro();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [links, setLinks] = useState<LinkedBrowser[]>([]);
  const [status, setStatus] = useState<WebDashboardStatus>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [linking, setLinking] = useState(false);
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
        (list) => active && setLinks(list),
        () => undefined,
      );
      if (proKnownRef.current) open();
    });
    // Only a real trip to the background closes the seats: iOS goes
    // `inactive` for the camera prompt, Face ID and Control Center too.
    const subscription = AppState.addEventListener('change', (state) => {
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
    // Opened once per visit; Pro changes are passed on below.
  }, []);

  useEffect(() => {
    isProRef.current = isPro;
    connections.current?.setPro(isPro);
  }, [isPro]);

  useEffect(() => {
    proKnownRef.current = isStatusKnown;
    if (isStatusKnown) openRef.current();
  }, [isStatusKnown]);

  const handleScanned = (text: string) => {
    setScannerOpen(false);
    setProblem(null);
    setNotice(null);
    setLinking(true);
    void beginLink(text)
      .then((pending) => {
        // Nothing is linked until the person checks the code and agrees, on
        // this phone and on the computer: a code from someone else's screen
        // would send them this phone's data.
        Alert.alert(
          pending.browserName
            ? I18n.t('web_dashboard.confirm_title', { name: pending.browserName })
            : I18n.t('web_dashboard.confirm_title_unnamed'),
          I18n.t('web_dashboard.confirm_message', {
            code: `${pending.code.slice(0, 3)} ${pending.code.slice(3)}`,
          }),
          [
            {
              text: I18n.t('common.cancel'),
              style: 'cancel',
              onPress: () => {
                pending.cancel();
                setLinking(false);
              },
            },
            {
              text: I18n.t('web_dashboard.confirm_action'),
              onPress: () => {
                // The computer asks too, and links only when both agree.
                setNotice(I18n.t('web_dashboard.confirm_waiting'));
                void pending
                  .confirm()
                  .then(async (link) => {
                    void triggerHaptic('success');
                    setNotice(
                      link.name
                        ? I18n.t('web_dashboard.linked', { name: link.name })
                        : I18n.t('web_dashboard.linked_unnamed'),
                    );
                    await reloadLinks();
                  })
                  .catch((error: unknown) => {
                    setNotice(null);
                    setProblem(errorMessage(error));
                  })
                  .finally(() => setLinking(false));
              },
            },
          ],
          { cancelable: false },
        );
      })
      .catch((error: unknown) => {
        setProblem(errorMessage(error));
        setLinking(false);
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
    const count = connections.current?.sendNow() ?? 0;
    setNotice(count ? null : I18n.t('web_dashboard.none_open'));
  };

  const openWeb = () => {
    void trackEvent(AnalyticsEvents.WEB_DASHBOARD_OPENED);
    void Linking.openURL(WEB_DASHBOARD_URL);
  };

  const anySending = Object.values(status).some((s) => s.state === 'sending');

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
            <Card className="mt-6">
              <CardContent className="items-center gap-5 py-8">
                <View className="h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
                  <Monitor size={40} color={colors.primary} strokeWidth={1.5} />
                </View>
                <View className="items-center gap-2">
                  <Text variant="headingSm" className="text-center">
                    {I18n.t('web_dashboard.link_title')}
                  </Text>
                  <Text variant="caption" tone="muted" className="text-center">
                    {I18n.t('web_dashboard.computer_hint')}
                  </Text>
                </View>
                <Button
                  variant="secondary"
                  className="w-full gap-2 px-3"
                  onPress={openWeb}
                  accessibilityLabel={I18n.t('web_dashboard.open_web')}
                >
                  <Text>app.money2time.com</Text>
                  <ExternalLink size={16} color={colors.primary} />
                </Button>
                <Button
                  className="w-full gap-2"
                  onPress={() => setScannerOpen(true)}
                  disabled={linking}
                >
                  <Text>
                    {linking
                      ? I18n.t('web_dashboard.linking')
                      : I18n.t('web_dashboard.link_action')}
                  </Text>
                </Button>
                <View className="flex-row items-center gap-2">
                  <ShieldCheck size={14} color={colors.textMuted} />
                  <Text variant="caption" tone="muted">
                    {I18n.t('web_dashboard.encrypted_label')}
                  </Text>
                </View>
              </CardContent>
            </Card>

            {links.length > 0 ? (
              <Card className="mt-4">
                <CardContent className="py-5 gap-3">
                  <Text variant="bodyStrong">{I18n.t('web_dashboard.browsers_title')}</Text>
                  {links.map((link) => (
                    <View key={link.roomId} style={styles.row}>
                      <View
                        className={`h-2.5 w-2.5 rounded-full ${
                          status[link.roomId]?.state === 'online' ||
                          status[link.roomId]?.state === 'sending'
                            ? 'bg-success'
                            : 'bg-muted-foreground'
                        }`}
                      />
                      <View style={styles.flex}>
                        <Text variant="body" numberOfLines={1}>
                          {link.name ?? I18n.t('web_dashboard.unknown_browser')}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {statusLine(link, status[link.roomId])}
                        </Text>
                      </View>
                      <Button variant="ghost" size="sm" onPress={() => handleUnlink(link)}>
                        <Text>{I18n.t('web_dashboard.unlink')}</Text>
                      </Button>
                    </View>
                  ))}
                  <Button
                    variant="secondary"
                    className="mt-1"
                    onPress={handleSendNow}
                    disabled={anySending}
                  >
                    <Text>
                      {anySending
                        ? I18n.t('web_dashboard.sending')
                        : I18n.t('web_dashboard.send_now')}
                    </Text>
                  </Button>
                  <Text variant="caption" tone="muted">
                    {I18n.t('web_dashboard.refresh_hint')}
                  </Text>
                </CardContent>
              </Card>
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
      <QrScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={handleScanned}
      />
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING },
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  loading: { paddingVertical: 32, alignItems: 'center' },
});
