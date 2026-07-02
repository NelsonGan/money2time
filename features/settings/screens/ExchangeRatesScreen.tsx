import { ChevronRight, GripVertical, Plus, RefreshCw, Trash2 } from 'lucide-react-native';
import type { ElementRef } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import {
  Card,
  CardContent,
  CurrencyPickerSheet,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  ThemeModal,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencyNameForCode, currencySymbolForCode } from '~/utils/currency';

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
    resetAndChangeMainCurrency,
    fxCurrencies,
    addFxCurrency,
    removeFxCurrency,
    reorderFxCurrencies,
  } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();
  const { checkLimit } = useProGate();
  const scrollRef = useAnimatedRef<ElementRef<typeof Animated.ScrollView>>();
  // Sortable items are absolutely positioned while dragging, so '100%' width
  // doesn't resolve — give each row an explicit pixel width like the other
  // reorderable settings lists.
  const { contentWidth } = useDeviceLayout();
  const rowWidth = Math.max(contentWidth - SETTINGS_HORIZONTAL_PADDING * 2, 0);

  const reporting = settings.currencyCode;
  const [refreshing, setRefreshing] = useState(false);
  const [rateVersion, setRateVersion] = useState(0);
  const [mainPickerVisible, setMainPickerVisible] = useState(false);
  const [addPickerVisible, setAddPickerVisible] = useState(false);
  const [editCode, setEditCode] = useState<string | null>(null);
  // Pending destructive main-currency change, awaiting typed confirmation.
  const [pendingMainCurrency, setPendingMainCurrency] = useState<string | null>(null);

  const rateRows = useMemo(() => listExchangeRates(), [listExchangeRates, rateVersion]);
  const rateByQuote = useMemo(() => new Map(rateRows.map((r) => [r.quoteCurrency, r])), [rateRows]);
  const asOfDate = useMemo(() => {
    let latest: string | null = null;
    for (const r of rateRows) {
      if (!latest || r.asOfDate > latest) latest = r.asOfDate;
    }
    return latest;
  }, [rateRows]);

  // Currencies the user's accounts use — always shown (rates are needed for
  // them) and not removable. Excludes the reporting currency itself.
  const currenciesInUse = useMemo(() => {
    const set = new Set<string>();
    for (const account of accounts) {
      if (account.currency && account.currency !== reporting) set.add(account.currency);
    }
    return set;
  }, [accounts, reporting]);

  // The tracked list = the sub-currencies the user added (in their saved order)
  // plus any account currency not yet tracked, appended. The stored order drives
  // display so drag-to-reorder is stable.
  const displayCodes = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const code of fxCurrencies) {
      if (code === reporting || seen.has(code)) continue;
      seen.add(code);
      ordered.push(code);
    }
    for (const code of currenciesInUse) {
      if (code === reporting || seen.has(code)) continue;
      seen.add(code);
      ordered.push(code);
    }
    return ordered;
  }, [currenciesInUse, fxCurrencies, reporting]);

  const excludeFromPicker = useMemo(() => [reporting, ...displayCodes], [reporting, displayCodes]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    void triggerHaptic('selection');
    const result = await refreshExchangeRates();
    setRefreshing(false);
    setRateVersion((v) => v + 1);
    if (result.ok) void triggerHaptic('success');
    else void triggerHaptic('warning');
  }, [refreshExchangeRates]);

  const handlePickMainCurrency = useCallback(
    (code: string) => {
      if (code === reporting) return;
      // Defer to a typed-confirmation modal — this wipes all data.
      setPendingMainCurrency(code);
    },
    [reporting],
  );

  // Free tier may hold a single sub-currency; adding more requires Pro. Account
  // currencies that are otherwise required (in use) don't count against it.
  const addedSubcurrencyCount = useMemo(
    () => fxCurrencies.filter((c) => c !== reporting && !currenciesInUse.has(c)).length,
    [currenciesInUse, fxCurrencies, reporting],
  );
  const handleOpenAddPicker = useCallback(() => {
    if (!checkLimit('subcurrencies', addedSubcurrencyCount)) return;
    void triggerHaptic('selection');
    setAddPickerVisible(true);
  }, [addedSubcurrencyCount, checkLimit]);

  const handleAddCurrency = useCallback(
    async (code: string) => {
      await addFxCurrency(code);
      setRateVersion((v) => v + 1);
      void triggerHaptic('success');
    },
    [addFxCurrency],
  );

  const handleSaveRate = useCallback(
    (code: string, rate: number) => {
      setManualExchangeRate(code, rate);
      setRateVersion((v) => v + 1);
      void triggerHaptic('success');
    },
    [setManualExchangeRate],
  );

  const handleRemoveCurrency = useCallback(
    (code: string) => {
      removeFxCurrency(code);
      setRateVersion((v) => v + 1);
    },
    [removeFxCurrency],
  );

  const editRow = editCode ? rateByQuote.get(editCode) : undefined;

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        title={I18n.t('exchange_rates.title')}
        onBack={onBack}
      />
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING, paddingBottom: 32 },
          bottomNavInset,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Card>
          <CardContent style={styles.summaryCard}>
            <Pressable
              onPress={() => setMainPickerVisible(true)}
              style={[styles.mainCurrencyRow, { borderColor: themeColors.border }]}
            >
              <View>
                <Text variant="caption" tone="muted">
                  {I18n.t('exchange_rates.main_currency')}
                </Text>
                <Text variant="friendly">
                  {reporting} · {currencyNameForCode(reporting)}
                </Text>
              </View>
              <ChevronRight size={18} color={themeColors.textMuted} />
            </Pressable>
            <View style={styles.summaryRow}>
              <Text variant="caption" tone="muted">
                {asOfDate
                  ? I18n.t('exchange_rates.as_of', { date: asOfDate })
                  : I18n.t('exchange_rates.never_updated')}
              </Text>
              <Pressable
                onPress={() => void handleRefresh()}
                disabled={refreshing}
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text variant="label" className="text-[12px] tracking-widest text-muted-foreground">
                {I18n.t('exchange_rates.subcurrencies_title')}
              </Text>
              <Pressable
                onPress={handleOpenAddPicker}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('exchange_rates.add_currency')}
                hitSlop={8}
                className="flex-row items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 active:opacity-80"
              >
                <Plus size={13} color={themeColors.primary} />
                <Text variant="caption" style={{ color: themeColors.primary }}>
                  {I18n.t('exchange_rates.add')}
                </Text>
              </Pressable>
            </View>
          </View>
          {displayCodes.length === 0 ? (
            <Card>
              <CardContent>
                <Text variant="caption" tone="muted">
                  {I18n.t('exchange_rates.no_foreign_accounts')}
                </Text>
              </CardContent>
            </Card>
          ) : (
            <Sortable.Flex
              activeItemScale={1.02}
              activeItemShadowOpacity={0.08}
              customHandle
              dragActivationDelay={0}
              flexDirection="column"
              flexWrap="nowrap"
              gap={8}
              inactiveItemOpacity={1}
              onDragEnd={({ fromIndex, toIndex, order }) => {
                if (fromIndex === toIndex) return;
                reorderFxCurrencies(order(displayCodes));
                void triggerHaptic('selection');
              }}
              scrollableRef={scrollRef}
              width="fill"
            >
              {displayCodes.map((code) => {
                const row = rateByQuote.get(code);
                const isManual = row?.source === 'manual';
                return (
                  <View
                    key={code}
                    style={[
                      styles.itemCard,
                      {
                        width: rowWidth,
                        backgroundColor: themeColors.card,
                        borderColor: themeColors.border,
                      },
                    ]}
                  >
                    <Sortable.Handle>
                      <View
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel={`${I18n.t('common.reorder')} ${code}`}
                        style={styles.dragHandle}
                      >
                        <GripVertical size={16} color={themeColors.textMuted} />
                      </View>
                    </Sortable.Handle>
                    <Pressable
                      onPress={() => setEditCode(code)}
                      style={({ pressed }) => [styles.rowPressable, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <View style={styles.rowMain}>
                        <Text variant="bodyStrong" style={styles.rateCode}>
                          {code}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1} style={styles.flex1}>
                          {currencyNameForCode(code)}
                        </Text>
                        <View style={styles.rateValue}>
                          {isManual ? <View style={styles.manualDot} /> : null}
                          <Text variant="body">{row ? formatRate(row.rate) : '—'}</Text>
                          <ChevronRight size={16} color={themeColors.textMuted} />
                        </View>
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </Sortable.Flex>
          )}
        </View>
      </Animated.ScrollView>

      <CurrencyPickerSheet
        visible={mainPickerVisible}
        onClose={() => setMainPickerVisible(false)}
        onSelect={handlePickMainCurrency}
        selectedCode={reporting}
        title={I18n.t('exchange_rates.main_currency')}
      />
      <CurrencyPickerSheet
        visible={addPickerVisible}
        onClose={() => setAddPickerVisible(false)}
        onSelect={(code) => void handleAddCurrency(code)}
        excludeCodes={excludeFromPicker}
        title={I18n.t('exchange_rates.add_currency')}
      />
      <RateEditModal
        code={editCode}
        reporting={reporting}
        currentRate={editRow?.rate ?? null}
        removable={editCode ? !currenciesInUse.has(editCode) : false}
        onClose={() => setEditCode(null)}
        onSave={handleSaveRate}
        onRemove={handleRemoveCurrency}
      />
      <MainCurrencyResetModal
        code={pendingMainCurrency}
        onClose={() => setPendingMainCurrency(null)}
        onConfirm={(c) => {
          setPendingMainCurrency(null);
          setMainPickerVisible(false);
          resetAndChangeMainCurrency(c);
          void triggerHaptic('success');
        }}
      />
    </SettingsPageLayout>
  );
}

interface MainCurrencyResetModalProps {
  code: string | null;
  onClose: () => void;
  onConfirm: (code: string) => void;
}

function MainCurrencyResetModal({ code, onClose, onConfirm }: MainCurrencyResetModalProps) {
  const themeColors = useThemeColors();
  const [text, setText] = useState('');
  const confirmWord = I18n.t('exchange_rates.reset_confirm_word');

  useEffect(() => {
    if (code) setText('');
  }, [code]);

  const matches = text.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <ThemeModal visible={!!code} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={onClose}>
        <Pressable
          className="w-full max-w-[360px] rounded-[28px] border border-border/30 bg-card p-5"
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="heading">{I18n.t('exchange_rates.reset_title')}</Text>
          <Text variant="body" tone="muted" className="mt-2">
            {I18n.t('exchange_rates.reset_message', { code: code ?? '' })}
          </Text>
          <Text variant="caption" tone="muted" className="mt-4 mb-1.5">
            {I18n.t('exchange_rates.reset_prompt', { word: confirmWord })}
          </Text>
          <TextInput
            value={text}
            onChangeText={setText}
            autoCapitalize="characters"
            autoCorrect={false}
            allowFontScaling={false}
            placeholder={confirmWord}
            placeholderTextColor={themeColors.textMuted}
            style={{
              color: themeColors.text,
              borderColor: themeColors.border,
              backgroundColor: themeColors.card,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
            }}
          />
          <View className="mt-5 flex-row items-center justify-end gap-2.5">
            <Pressable
              onPress={onClose}
              className="rounded-pill bg-secondary/60 px-5 py-2.5"
              accessibilityRole="button"
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => code && matches && onConfirm(code)}
              disabled={!matches}
              style={{ backgroundColor: themeColors.error, opacity: matches ? 1 : 0.4 }}
              className="rounded-pill px-5 py-2.5"
              accessibilityRole="button"
            >
              <Text variant="caption" tone="inverse">
                {I18n.t('exchange_rates.reset_action')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

interface RateEditModalProps {
  code: string | null;
  reporting: string;
  currentRate: number | null;
  removable: boolean;
  onClose: () => void;
  onSave: (code: string, rate: number) => void;
  onRemove: (code: string) => void;
}

function RateEditModal({
  code,
  reporting,
  currentRate,
  removable,
  onClose,
  onSave,
  onRemove,
}: RateEditModalProps) {
  const themeColors = useThemeColors();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (code) setDraft(currentRate != null ? formatRate(currentRate) : '');
  }, [code, currentRate]);

  const handleSave = () => {
    if (!code) return;
    const parsed = Number(draft.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) onSave(code, parsed);
    onClose();
  };

  return (
    <ThemeModal visible={!!code} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={onClose}>
        <Pressable
          className="w-full max-w-[340px] rounded-[28px] border border-border/30 bg-card p-5"
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="heading">{code ?? ''}</Text>
          <Text variant="caption" tone="muted">
            {code ? currencyNameForCode(code) : ''}
          </Text>

          <View className="mt-4 flex-row items-center gap-2">
            <Text variant="body" tone="muted">
              1 {reporting} =
            </Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={themeColors.textMuted}
              allowFontScaling={false}
              style={{
                flex: 1,
                color: themeColors.text,
                borderColor: themeColors.border,
                backgroundColor: themeColors.card,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                textAlign: 'right',
                fontSize: 16,
              }}
            />
            <Text variant="body" tone="muted">
              {code}
            </Text>
          </View>

          <View className="mt-5 flex-row items-center justify-between">
            {removable && code ? (
              <Pressable
                onPress={() => {
                  onRemove(code);
                  onClose();
                }}
                className="flex-row items-center gap-1.5 rounded-pill bg-secondary/60 px-4 py-2.5"
                accessibilityRole="button"
              >
                <Trash2 size={15} color={themeColors.error} />
                <Text variant="caption" style={{ color: themeColors.error }}>
                  {I18n.t('exchange_rates.remove_currency')}
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View className="flex-row items-center gap-2.5">
              <Pressable
                onPress={onClose}
                className="rounded-pill bg-secondary/60 px-5 py-2.5"
                accessibilityRole="button"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                className="rounded-pill bg-primary px-5 py-2.5 shadow-glow"
                accessibilityRole="button"
              >
                <Text variant="caption" tone="inverse">
                  {I18n.t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  summaryCard: { gap: 12 },
  mainCurrencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
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
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingLeft: 8,
    paddingRight: 14,
  },
  rowPressable: {
    flex: 1,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: 12,
  },
  dragHandle: {
    paddingVertical: 14,
    paddingRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: { marginTop: 28, gap: 12 },
  sectionHeader: { paddingHorizontal: 4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rateCode: { width: 48 },
  flex1: { flex: 1, minWidth: 0 },
  rateValue: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#C99A3A' },
});
