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
  ClayIcon,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useIsPro } from '~/context/ProContext';
import { QrScannerModal } from '~/features/settings/components/QrScannerModal';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import {
  isWebDashboardAvailable,
  type LinkedBrowser,
  linkScannedBrowser,
  listLinkedBrowsers,
  WEB_DASHBOARD_URL,
  WebDashboardConnections,
  WebDashboardError,
  type WebDashboardStatus,
} from '~/services/webDashboard';

interface WebDashboardScreenProps {
  onBack: () => void;
}

function errorMessage(error: unknown): string {
  const code = error instanceof WebDashboardError ? error.code : 'offline';
  return I18n.t(`web_dashboard.errors.${code}`, {
    defaultValue: I18n.t('web_dashboard.errors.offline'),
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
export function WebDashboardScreen({ onBack }: WebDashboardScreenProps) {
  const bottomNavInset = useSettingsBottomNavInset();
  const isPro = useIsPro();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [links, setLinks] = useState<LinkedBrowser[]>([]);
  const [status, setStatus] = useState<WebDashboardStatus>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const connections = useRef<WebDashboardConnections | null>(null);

  const reloadLinks = useCallback(async () => {
    setLinks(await listLinkedBrowsers());
    await connections.current?.sync();
  }, []);

  // A seat in every linked browser's room for as long as this screen is open
  // and the app is in the foreground.
  useEffect(() => {
    let active = true;
    const open = () => {
      if (connections.current) return;
      const manager = new WebDashboardConnections({
        isPro,
        onChange: (next) => active && setStatus(next),
        onLinksChanged: () => {
          if (active) void listLinkedBrowsers().then(setLinks);
        },
      });
      connections.current = manager;
      void manager.sync();
    };
    const close = () => {
      connections.current?.close();
      connections.current = null;
      setStatus({});
    };
    void isWebDashboardAvailable().then((yes) => {
      if (!active) return;
      setAvailable(yes);
      if (!yes) return;
      void listLinkedBrowsers().then((list) => active && setLinks(list));
      open();
    });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') open();
      else close();
    });
    return () => {
      active = false;
      subscription.remove();
      close();
    };
    // Opened once per visit; Pro changes are passed on below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    connections.current?.setPro(isPro);
  }, [isPro]);

  const handleScanned = (text: string) => {
    setScannerOpen(false);
    setProblem(null);
    setNotice(null);
    setLinking(true);
    void linkScannedBrowser(text)
      .then(async (link) => {
        void triggerHaptic('success');
        setNotice(
          I18n.t('web_dashboard.linked', {
            name: link.name ?? I18n.t('web_dashboard.unknown_browser'),
          }),
        );
        await reloadLinks();
      })
      .catch((error: unknown) => setProblem(errorMessage(error)))
      .finally(() => setLinking(false));
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
          onPress: () => void connections.current?.unlink(link.roomId),
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

  const anyOpen = Object.values(status).some((s) => s.state === 'online');
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
        <Card>
          <CardContent className="py-5 gap-3">
            <View style={styles.introRow}>
              <ClayIcon name="insights/growth-analysis" size={44} flatSize={28} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{I18n.t('web_dashboard.intro_title')}</Text>
                <Text variant="caption" tone="muted" className="mt-1">
                  {I18n.t('web_dashboard.intro_body')}
                </Text>
              </View>
            </View>
            <Text variant="caption" tone="secondary">
              {I18n.t('web_dashboard.private_note')}
            </Text>
            <Text variant="caption" tone="secondary">
              {I18n.t('web_dashboard.source_of_truth')}
            </Text>
          </CardContent>
        </Card>

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
            <Card className="mt-4">
              <CardContent className="py-5 gap-3">
                <Text variant="bodyStrong">{I18n.t('web_dashboard.link_title')}</Text>
                <Text variant="caption" tone="muted">
                  {I18n.t('web_dashboard.link_body')}
                </Text>
                <Button onPress={() => setScannerOpen(true)} disabled={linking}>
                  <Text>
                    {linking
                      ? I18n.t('web_dashboard.linking')
                      : I18n.t('web_dashboard.link_action')}
                  </Text>
                </Button>
              </CardContent>
            </Card>

            {links.length > 0 ? (
              <Card className="mt-4">
                <CardContent className="py-5 gap-3">
                  <Text variant="bodyStrong">{I18n.t('web_dashboard.browsers_title')}</Text>
                  {links.map((link) => (
                    <View key={link.roomId} style={styles.row}>
                      <View
                        style={[
                          styles.dot,
                          status[link.roomId]?.state === 'online' ||
                          status[link.roomId]?.state === 'sending'
                            ? styles.dotOn
                            : styles.dotOff,
                        ]}
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
                    disabled={!anyOpen || anySending}
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

            <Button variant="ghost" className="mt-4" onPress={openWeb}>
              <Text>{I18n.t('web_dashboard.open_web')}</Text>
            </Button>
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
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotOn: { backgroundColor: '#2BB673' },
  dotOff: { backgroundColor: '#B8C2BF' },
  flex: { flex: 1 },
  loading: { paddingVertical: 32, alignItems: 'center' },
});
