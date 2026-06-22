import { Check, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  CardContent,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencyNameForCode, currencySymbolForCode, isAutoRateSupported } from '~/utils/currency';

interface ExchangeRatesScreenProps {
  onBack: () => void;
}

function formatRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toPrecision(4);
}

export function ExchangeRatesScreen({ onBack }: ExchangeRatesScreenProps) {
  const { settings, accounts, listExchangeRates, refreshExchangeRates, setManualExchangeRate } =
    useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();

  const reporting = settings.currencyCode;
  const [refreshing, setRefreshing] = useState(false);
  // Local edit buffers for manual-rate inputs, keyed by currency code.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rateVersion, setRateVersion] = useState(0);

  const rateRows = useMemo(() => listExchangeRates(), [listExchangeRates, rateVersion]);
  const rateByQuote = useMemo(() => new Map(rateRows.map((r) => [r.quoteCurrency, r])), [rateRows]);
  const asOfDate = useMemo(() => {
    let latest: string | null = null;
    for (const r of rateRows) {
      if (!latest || r.asOfDate > latest) latest = r.asOfDate;
    }
    return latest;
  }, [rateRows]);

  // Currencies actually in use across the user's accounts (excluding the
  // reporting currency itself) — surfaced first and always shown even when no
  // cached rate exists yet, so the user can enter one manually.
  const currenciesInUse = useMemo(() => {
    const set = new Set<string>();
    for (const account of accounts) {
      if (account.currency && account.currency !== reporting) set.add(account.currency);
    }
    return set;
  }, [accounts, reporting]);

  // Every currency we have a cached rate for (the full daily-refreshed table),
  // merged with the in-use currencies. In-use currencies sort to the top.
  const displayCodes = useMemo(() => {
    const set = new Set<string>(currenciesInUse);
    for (const r of rateRows) {
      if (r.quoteCurrency !== reporting) set.add(r.quoteCurrency);
    }
    return Array.from(set).sort((a, b) => {
      const aInUse = currenciesInUse.has(a);
      const bInUse = currenciesInUse.has(b);
      if (aInUse !== bInUse) return aInUse ? -1 : 1;
      return a.localeCompare(b);
    });
  }, [currenciesInUse, rateRows, reporting]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    void triggerHaptic('selection');
    const result = await refreshExchangeRates();
    setRefreshing(false);
    setRateVersion((v) => v + 1);
    if (result.ok) void triggerHaptic('success');
    else void triggerHaptic('warning');
  }, [refreshExchangeRates]);

  const commitManualRate = useCallback(
    (code: string) => {
      const raw = drafts[code];
      if (raw === undefined) return;
      const parsed = Number(raw.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      setManualExchangeRate(code, parsed);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      setRateVersion((v) => v + 1);
      void triggerHaptic('success');
    },
    [drafts, setManualExchangeRate],
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader title={I18n.t('exchange_rates.title')} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING, paddingBottom: 32 },
          bottomNavInset,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <CardContent style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text variant="caption" tone="muted">
                {I18n.t('exchange_rates.main_currency')}
              </Text>
              <Text variant="friendly">
                {reporting} ({currencySymbolForCode(reporting)})
              </Text>
            </View>
            <Text variant="caption" tone="muted">
              {asOfDate
                ? I18n.t('exchange_rates.as_of', { date: asOfDate })
                : I18n.t('exchange_rates.never_updated')}
            </Text>
            {settings.lastRateFetchError ? (
              <Text variant="caption" style={{ color: themeColors.error }}>
                {settings.lastRateFetchError}
              </Text>
            ) : null}
            <Button
              variant="outline"
              onPress={() => void handleRefresh()}
              disabled={refreshing}
              style={styles.refreshButton}
            >
              <View style={styles.buttonInner}>
                {refreshing ? (
                  <ActivityIndicator size="small" color={themeColors.primary} />
                ) : (
                  <RefreshCw size={16} color={themeColors.primary} />
                )}
                <Text>
                  {refreshing
                    ? I18n.t('exchange_rates.updating')
                    : I18n.t('exchange_rates.update_rates')}
                </Text>
              </View>
            </Button>
          </CardContent>
        </Card>

        <SettingsSection
          title={I18n.t('exchange_rates.rates_title')}
          subtitle={I18n.t('exchange_rates.rates_subtitle')}
        >
          {displayCodes.length === 0 ? (
            <Card>
              <CardContent>
                <Text variant="friendly" tone="muted">
                  {I18n.t('exchange_rates.no_foreign_accounts')}
                </Text>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent style={styles.list}>
                {displayCodes.map((code, index) => {
                  const row = rateByQuote.get(code);
                  const supported = isAutoRateSupported(code);
                  const draft = drafts[code];
                  const displayValue =
                    draft !== undefined ? draft : row ? formatRate(row.rate) : '';
                  return (
                    <View
                      key={code}
                      style={[
                        styles.rateRow,
                        index > 0
                          ? { borderTopColor: themeColors.border, borderTopWidth: 1 }
                          : null,
                      ]}
                    >
                      <View style={styles.rateInfo}>
                        <Text variant="friendly">
                          {code} · {currencyNameForCode(code)}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {row?.source === 'manual'
                            ? I18n.t('exchange_rates.manual_badge')
                            : supported
                              ? I18n.t('exchange_rates.auto_badge')
                              : I18n.t('exchange_rates.manual_only')}
                        </Text>
                      </View>
                      <View style={styles.rateEntry}>
                        <Text variant="caption" tone="muted">
                          1 {reporting} =
                        </Text>
                        <TextInput
                          value={displayValue}
                          onChangeText={(text) => setDrafts((prev) => ({ ...prev, [code]: text }))}
                          onBlur={() => commitManualRate(code)}
                          keyboardType="decimal-pad"
                          placeholder="—"
                          placeholderTextColor={themeColors.textMuted}
                          allowFontScaling={false}
                          style={[
                            styles.rateInput,
                            {
                              color: themeColors.text,
                              borderColor: themeColors.border,
                              backgroundColor: themeColors.card,
                            },
                          ]}
                        />
                        {draft !== undefined ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onPress={() => commitManualRate(code)}
                          >
                            <Check size={16} color={themeColors.primary} />
                          </Button>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </SettingsSection>

        <Text variant="caption" tone="muted" style={styles.footnote}>
          {I18n.t('exchange_rates.footnote')}
        </Text>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  summaryCard: { gap: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refreshButton: { marginTop: 8 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  list: { gap: 0 },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  rateInfo: { flex: 1, gap: 2 },
  rateEntry: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateInput: {
    minWidth: 96,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    textAlign: 'right',
    fontSize: 15,
  },
  footnote: { marginTop: 16 },
});
