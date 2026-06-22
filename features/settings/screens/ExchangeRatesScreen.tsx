import { RefreshCw } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  Card,
  CardContent,
  SelectField,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { MAJOR_CURRENCIES } from '~/constants/appDefaults';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencyNameForCode } from '~/utils/currency';

interface ExchangeRatesScreenProps {
  onBack: () => void;
}

function formatRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toPrecision(4);
}

export function ExchangeRatesScreen({ onBack }: ExchangeRatesScreenProps) {
  const {
    settings,
    accounts,
    listExchangeRates,
    refreshExchangeRates,
    setManualExchangeRate,
    changeReportingCurrency,
  } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();

  const reporting = settings.currencyCode;
  const [refreshing, setRefreshing] = useState(false);
  const [changingCurrency, setChangingCurrency] = useState(false);
  // Local edit buffers for manual-rate inputs, keyed by currency code.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rateVersion, setRateVersion] = useState(0);

  const currencyOptions = useMemo(
    () =>
      MAJOR_CURRENCIES.map((item) => ({
        value: item.code,
        label: `${item.code} (${item.symbol}) · ${item.name}`,
      })),
    [],
  );

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

  const handleChangeMainCurrency = useCallback(
    async (code: string) => {
      if (code === reporting || changingCurrency) return;
      setChangingCurrency(true);
      void triggerHaptic('selection');
      try {
        await changeReportingCurrency(code);
        setRateVersion((v) => v + 1);
        void triggerHaptic('success');
      } finally {
        setChangingCurrency(false);
      }
    },
    [changeReportingCurrency, changingCurrency, reporting],
  );

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
            <SelectField
              label={I18n.t('exchange_rates.main_currency')}
              sheetTitle={I18n.t('exchange_rates.main_currency')}
              value={reporting}
              options={currencyOptions}
              optionsLayout="list"
              onChange={(code) => void handleChangeMainCurrency(code)}
            />
            <View style={styles.summaryRow}>
              <Text variant="caption" tone="muted">
                {changingCurrency
                  ? I18n.t('exchange_rates.updating')
                  : asOfDate
                    ? I18n.t('exchange_rates.as_of', { date: asOfDate })
                    : I18n.t('exchange_rates.never_updated')}
              </Text>
              <Pressable
                onPress={() => void handleRefresh()}
                disabled={refreshing || changingCurrency}
                style={[styles.refreshButton, { borderColor: themeColors.border }]}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color={themeColors.primary} />
                ) : (
                  <RefreshCw size={14} color={themeColors.primary} />
                )}
                <Text variant="caption" style={{ color: themeColors.primary }}>
                  {I18n.t('exchange_rates.update_rates')}
                </Text>
              </Pressable>
            </View>
            {settings.lastRateFetchError ? (
              <Text variant="caption" style={{ color: themeColors.error }}>
                {settings.lastRateFetchError}
              </Text>
            ) : null}
          </CardContent>
        </Card>

        <SettingsSection title={I18n.t('exchange_rates.rates_title')}>
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
                        <Text variant="bodyStrong">{code}</Text>
                        <Text
                          variant="caption"
                          tone="muted"
                          numberOfLines={1}
                          style={styles.rateName}
                        >
                          {row?.source === 'manual'
                            ? I18n.t('exchange_rates.manual_badge')
                            : currencyNameForCode(code)}
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
                      </View>
                    </View>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </SettingsSection>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  summaryCard: { gap: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  list: { gap: 0 },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  rateInfo: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rateName: { flexShrink: 1 },
  rateEntry: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateInput: {
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'right',
    fontSize: 15,
  },
});
