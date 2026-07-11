import { Camera, ChevronRight, Mic, Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import {
  AccountPickerSheet,
  CategoryEmoji,
  type CategoryPickerOption,
  CategoryPickerSheet,
  CurrencyPickerSheet,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  type KeywordCategoryKey,
  resolveBucketCategoryIds,
} from '~/features/transactions/utils/categoryKeywords';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { isSpeechRecognitionAvailable } from '~/services/speechRecognition';
import { ensureVoiceInputPermission } from '~/services/voiceInputPermission';
import type { AddButtonAction, Category } from '~/types';
import { currencyNameForCode } from '~/utils/currency';

interface QuickEntrySettingsScreenProps {
  onBack: () => void;
}

// Icon shown in a default-category row when no category has been chosen yet.
const QUICK_ENTRY_DEFAULT_ICON = 'question-mark';

const BUCKET_KEYS: KeywordCategoryKey[] = [
  'food',
  'groceries',
  'transport',
  'housing',
  'bills',
  'healthcare',
  'shopping',
  'entertainment',
  'education',
  'pets',
  'travel',
  'fitness',
  'gifts',
  'salary',
  'investment',
  'refund',
];

function bucketLabel(key: KeywordCategoryKey): string {
  return I18n.t(`settings.quick_entry.bucket_labels.${key}`);
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginLeft: 16,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleEmoji: {
    fontSize: 18,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
});

function buildPickerOptions(categories: Category[]): {
  parents: CategoryPickerOption[];
  childByParent: Map<string, CategoryPickerOption[]>;
} {
  const parents: CategoryPickerOption[] = [];
  const childByParent = new Map<string, CategoryPickerOption[]>();
  const parentIds = new Set<string>();
  categories.forEach((category) => {
    if (!category.parentId) {
      parents.push({ id: category.id, name: category.name, icon: category.icon });
      parentIds.add(category.id);
    }
  });
  categories.forEach((category) => {
    if (category.parentId && parentIds.has(category.parentId)) {
      const list = childByParent.get(category.parentId) ?? [];
      list.push({ id: category.id, name: category.name, icon: category.icon });
      childByParent.set(category.parentId, list);
    }
  });
  return { parents, childByParent };
}

export function QuickEntrySettingsScreen({ onBack }: QuickEntrySettingsScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const {
    settings,
    accounts,
    accountGroups,
    categories,
    fxCurrencies,
    quickEntryPrefs,
    updateQuickEntryPrefs,
  } = useApp();
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories],
  );

  const expensePicker = useMemo(() => buildPickerOptions(expenseCategories), [expenseCategories]);
  const incomePicker = useMemo(() => buildPickerOptions(incomeCategories), [incomeCategories]);

  const bucketResolution = useMemo(() => {
    // Resolve per bucket against all categories (some buckets are income-flavored)
    const fromAll = resolveBucketCategoryIds(categories, quickEntryPrefs.categoryMap);
    return fromAll;
  }, [categories, quickEntryPrefs.categoryMap]);

  const categoryById = useMemo(() => {
    const m = new Map<string, Category>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const [activeBucket, setActiveBucket] = useState<KeywordCategoryKey | null>(null);
  const [activeDefault, setActiveDefault] = useState<'expense' | 'income' | null>(null);
  const [defaultAccountPickerVisible, setDefaultAccountPickerVisible] = useState(false);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);

  // Currencies the user can pin quick-entry to: reporting + sub-currencies +
  // any currency an account already uses. Only worth showing when there's a
  // real choice (more than one available currency).
  const enabledCurrencies = useMemo(() => {
    const set = new Set<string>([settings.currencyCode, ...fxCurrencies]);
    for (const account of accounts) {
      if (account.currency) set.add(account.currency);
    }
    return Array.from(set);
  }, [accounts, fxCurrencies, settings.currencyCode]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSpeechRecognitionAvailable();
      if (!cancelled) setVoiceSupported(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isIncomeBucket = (bucket: KeywordCategoryKey) =>
    bucket === 'salary' || bucket === 'investment' || bucket === 'refund';

  const handleOpenBucket = useCallback((bucket: KeywordCategoryKey) => {
    void triggerHaptic('selection');
    setActiveBucket(bucket);
  }, []);

  const handleToggleVoice = useCallback(
    async (next: boolean) => {
      void triggerHaptic('selection');
      if (!next) {
        updateQuickEntryPrefs({ voiceInputEnabled: false });
        return;
      }
      // Turning ON — make sure mic + speech permissions are granted before we
      // flip the pref. Otherwise the long-press flow would fail at first use.
      if (!(await ensureVoiceInputPermission())) return;
      updateQuickEntryPrefs({ voiceInputEnabled: true });
    },
    [updateQuickEntryPrefs],
  );

  const handlePickBucketCategory = useCallback(
    (categoryId: string) => {
      if (!activeBucket) return;
      const nextMap = { ...quickEntryPrefs.categoryMap, [activeBucket]: categoryId };
      updateQuickEntryPrefs({ categoryMap: nextMap });
      setActiveBucket(null);
    },
    [activeBucket, quickEntryPrefs.categoryMap, updateQuickEntryPrefs],
  );

  const handlePickDefault = useCallback(
    (categoryId: string) => {
      if (activeDefault === 'expense') {
        updateQuickEntryPrefs({ defaultExpenseCategoryId: categoryId });
      } else if (activeDefault === 'income') {
        updateQuickEntryPrefs({ defaultIncomeCategoryId: categoryId });
      }
      setActiveDefault(null);
    },
    [activeDefault, updateQuickEntryPrefs],
  );

  const handlePickDefaultAccount = useCallback(
    (accountId: string) => {
      updateQuickEntryPrefs({ defaultAccountId: accountId });
      setDefaultAccountPickerVisible(false);
    },
    [updateQuickEntryPrefs],
  );

  const handlePickDefaultCurrency = useCallback(
    (code: string) => {
      updateQuickEntryPrefs({ defaultCurrency: code });
      setCurrencyPickerVisible(false);
    },
    [updateQuickEntryPrefs],
  );

  const chooseAddAction = useCallback(
    (slot: 'primary' | 'secondary') => {
      void triggerHaptic('selection');
      // Only offer voice once it's actually enabled — otherwise picking it would
      // silently no-op at runtime (voice needs the toggle above turned on).
      const voiceOptions: AddButtonAction[] =
        voiceSupported && quickEntryPrefs.voiceInputEnabled ? ['voice'] : [];
      const options: (AddButtonAction | 'none')[] =
        slot === 'primary'
          ? ['quick', 'full', 'scan', ...voiceOptions]
          : [...voiceOptions, 'scan', 'full', 'quick', 'none'];
      const buttons = options.map((opt) => ({
        text: I18n.t(`settings.quick_entry.add_button.action_${opt}`),
        onPress: () =>
          updateQuickEntryPrefs(
            slot === 'primary'
              ? { addPrimaryAction: opt as AddButtonAction }
              : { addSecondaryAction: opt },
          ),
      }));
      Alert.alert(
        I18n.t(
          slot === 'primary'
            ? 'settings.quick_entry.add_button.tap_label'
            : 'settings.quick_entry.add_button.hold_label',
        ),
        undefined,
        [...buttons, { text: I18n.t('common.cancel'), style: 'cancel' as const }],
      );
    },
    [voiceSupported, quickEntryPrefs.voiceInputEnabled, updateQuickEntryPrefs],
  );

  const pinnedCurrency =
    quickEntryPrefs.defaultCurrency && enabledCurrencies.includes(quickEntryPrefs.defaultCurrency)
      ? quickEntryPrefs.defaultCurrency
      : null;

  // When no explicit default account has been chosen, surface the same fallback
  // the entry flows use at runtime — the user's first account — so the row
  // displays the actual account that will be charged.
  const firstAccountByOrder = useMemo(() => {
    if (accounts.length === 0) return null;
    return [...accounts].sort(
      (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
    )[0];
  }, [accounts]);
  const defaultAccount = useMemo(() => {
    if (quickEntryPrefs.defaultAccountId) {
      const explicit = accounts.find((a) => a.id === quickEntryPrefs.defaultAccountId);
      if (explicit) return explicit;
    }
    return firstAccountByOrder;
  }, [accounts, firstAccountByOrder, quickEntryPrefs.defaultAccountId]);

  const defaultExpenseCategory = quickEntryPrefs.defaultExpenseCategoryId
    ? (categoryById.get(quickEntryPrefs.defaultExpenseCategoryId) ?? null)
    : null;
  const defaultIncomeCategory = quickEntryPrefs.defaultIncomeCategoryId
    ? (categoryById.get(quickEntryPrefs.defaultIncomeCategoryId) ?? null)
    : null;

  const renderRow = (
    title: string,
    mapped: Category | null,
    fallbackLabel: string,
    onPress: () => void,
    badge?: string,
  ) => {
    const parent = mapped?.parentId ? (categoryById.get(mapped.parentId) ?? null) : null;
    const categoryLabel = mapped
      ? parent
        ? `${parent.name} • ${mapped.name}`
        : mapped.name
      : fallbackLabel;
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      >
        <View style={styles.row}>
          <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
            <CategoryEmoji
              icon={mapped?.icon || QUICK_ENTRY_DEFAULT_ICON}
              parentIcon={parent?.icon}
              size={18}
              style={styles.iconBubbleEmoji}
            />
          </View>
          <View style={styles.rowText}>
            <Text variant="body" className="text-foreground" numberOfLines={1}>
              {title}
            </Text>
            <Text
              variant="caption"
              className={mapped ? 'text-foreground/70' : 'text-muted-foreground'}
              numberOfLines={1}
            >
              {categoryLabel}
            </Text>
          </View>
          <View style={styles.trailing}>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: `${themeColors.primary}24` }]}>
                <Text style={[styles.badgeText, { color: themeColors.primary }]}>{badge}</Text>
              </View>
            ) : null}
            <ChevronRight size={16} color={themeColors.textMuted} />
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SettingsPageLayout>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <View className="px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('settings.quick_entry.title')}
          />

          <>
            <View className="mt-4">
              <Text variant="caption" tone="muted" className="mb-2 px-1">
                {I18n.t('settings.quick_entry.add_button.section_title')}
              </Text>
              <View style={styles.card} className="bg-card border border-border/30">
                <View style={styles.voiceRow}>
                  <View
                    style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}
                  >
                    <Plus size={18} color={themeColors.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text variant="body" className="text-foreground" numberOfLines={1}>
                      {I18n.t('settings.quick_entry.add_button.sheet_label')}
                    </Text>
                    <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
                      {I18n.t('settings.quick_entry.add_button.sheet_subtitle')}
                    </Text>
                  </View>
                  <Switch
                    value={quickEntryPrefs.addUseActionSheet}
                    onValueChange={(v) => updateQuickEntryPrefs({ addUseActionSheet: v })}
                    trackColor={{ false: themeColors.border, true: themeColors.primary }}
                  />
                </View>
                {!quickEntryPrefs.addUseActionSheet ? (
                  <>
                    <View style={styles.rowDivider} />
                    <Pressable
                      onPress={() => chooseAddAction('primary')}
                      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <View style={styles.row}>
                        <View style={styles.rowText}>
                          <Text variant="body" className="text-foreground" numberOfLines={1}>
                            {I18n.t('settings.quick_entry.add_button.tap_label')}
                          </Text>
                          <Text
                            variant="caption"
                            className="text-muted-foreground"
                            numberOfLines={1}
                          >
                            {I18n.t(
                              `settings.quick_entry.add_button.action_${quickEntryPrefs.addPrimaryAction}`,
                            )}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={themeColors.textMuted} />
                      </View>
                    </Pressable>
                    <View style={styles.rowDivider} />
                    <Pressable
                      onPress={() => chooseAddAction('secondary')}
                      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <View style={styles.row}>
                        <View style={styles.rowText}>
                          <Text variant="body" className="text-foreground" numberOfLines={1}>
                            {I18n.t('settings.quick_entry.add_button.hold_label')}
                          </Text>
                          <Text
                            variant="caption"
                            className="text-muted-foreground"
                            numberOfLines={1}
                          >
                            {I18n.t(
                              `settings.quick_entry.add_button.action_${quickEntryPrefs.addSecondaryAction}`,
                            )}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={themeColors.textMuted} />
                      </View>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>

            <View className="mt-4">
              <Text variant="caption" tone="muted" className="mb-2 px-1">
                {I18n.t('settings.quick_entry.default_account_section')}
              </Text>
              <View style={styles.card} className="bg-card border border-border/30">
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setDefaultAccountPickerVisible(true);
                  }}
                  android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text variant="body" className="text-foreground" numberOfLines={1}>
                        {I18n.t('settings.quick_entry.default_account_label')}
                      </Text>
                      <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
                        {defaultAccount?.name ??
                          I18n.t('settings.quick_entry.default_account_subtitle')}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={themeColors.textMuted} />
                  </View>
                </Pressable>
                {enabledCurrencies.length > 1 ? (
                  <>
                    <View style={styles.rowDivider} />
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setCurrencyPickerVisible(true);
                      }}
                      android_ripple={{ color: 'rgba(0,0,0,0.04)' }}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                    >
                      <View style={styles.row}>
                        <View style={styles.rowText}>
                          <Text variant="body" className="text-foreground" numberOfLines={1}>
                            {I18n.t('settings.quick_entry.default_currency_label')}
                          </Text>
                          <Text
                            variant="caption"
                            className="text-muted-foreground"
                            numberOfLines={2}
                          >
                            {pinnedCurrency
                              ? `${pinnedCurrency} · ${currencyNameForCode(pinnedCurrency)}`
                              : I18n.t('settings.quick_entry.default_currency_auto')}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={themeColors.textMuted} />
                      </View>
                    </Pressable>
                  </>
                ) : null}
              </View>
            </View>

            {voiceSupported ? (
              <View className="mt-4">
                <Text variant="caption" tone="muted" className="mb-2 px-1">
                  {I18n.t('settings.quick_entry.voice.section_title')}
                </Text>
                <View style={styles.card} className="bg-card border border-border/30">
                  <View style={styles.voiceRow}>
                    <View
                      style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}
                    >
                      <Mic size={18} color={themeColors.primary} />
                    </View>
                    <View style={styles.rowText}>
                      <Text variant="body" className="text-foreground" numberOfLines={1}>
                        {I18n.t('settings.quick_entry.voice.row_label')}
                      </Text>
                      <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
                        {I18n.t('settings.quick_entry.voice.row_subtitle')}
                      </Text>
                    </View>
                    <Switch
                      value={quickEntryPrefs.voiceInputEnabled}
                      onValueChange={(v) => void handleToggleVoice(v)}
                      trackColor={{ false: themeColors.border, true: themeColors.primary }}
                    />
                  </View>

                  {quickEntryPrefs.voiceInputEnabled ? (
                    <>
                      <View style={styles.rowDivider} />
                      <View style={styles.voiceRow}>
                        <View
                          style={[
                            styles.iconBubble,
                            { backgroundColor: `${themeColors.primary}14` },
                          ]}
                        >
                          <Text style={styles.iconBubbleEmoji}>⚡️</Text>
                        </View>
                        <View style={styles.rowText}>
                          <Text variant="body" className="text-foreground" numberOfLines={1}>
                            {I18n.t('settings.quick_entry.voice.skip_confirmation_label')}
                          </Text>
                          <Text
                            variant="caption"
                            className="text-muted-foreground"
                            numberOfLines={2}
                          >
                            {I18n.t('settings.quick_entry.voice.skip_confirmation_subtitle')}
                          </Text>
                        </View>
                        <Switch
                          value={quickEntryPrefs.voiceSkipConfirmation}
                          onValueChange={(v) => {
                            void triggerHaptic('selection');
                            updateQuickEntryPrefs({ voiceSkipConfirmation: v });
                          }}
                          trackColor={{ false: themeColors.border, true: themeColors.primary }}
                        />
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View className="mt-4">
              <Text variant="caption" tone="muted" className="mb-2 px-1">
                {I18n.t('settings.quick_entry.scan.section_title')}
              </Text>
              <View style={styles.card} className="bg-card border border-border/30">
                <View style={styles.voiceRow}>
                  <View
                    style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}
                  >
                    <Camera size={18} color={themeColors.primary} />
                  </View>
                  <View style={styles.rowText}>
                    <Text variant="body" className="text-foreground" numberOfLines={1}>
                      {I18n.t('settings.quick_entry.scan.skip_confirmation_label')}
                    </Text>
                    <Text variant="caption" className="text-muted-foreground" numberOfLines={2}>
                      {I18n.t('settings.quick_entry.scan.skip_confirmation_subtitle')}
                    </Text>
                  </View>
                  <Switch
                    value={quickEntryPrefs.scanSkipConfirmation}
                    onValueChange={(v) => {
                      void triggerHaptic('selection');
                      updateQuickEntryPrefs({ scanSkipConfirmation: v });
                    }}
                    trackColor={{ false: themeColors.border, true: themeColors.primary }}
                  />
                </View>
              </View>
            </View>

            {(['expense', 'income'] as const).map((section) => {
              const isIncome = section === 'income';
              const sectionBuckets = BUCKET_KEYS.filter((k) =>
                isIncome ? isIncomeBucket(k) : !isIncomeBucket(k),
              );
              const defaultCategory = isIncome ? defaultIncomeCategory : defaultExpenseCategory;
              return (
                <View key={section} className="mt-4">
                  <Text variant="caption" tone="muted" className="mb-2 px-1">
                    {I18n.t(
                      isIncome
                        ? 'settings.quick_entry.section_income'
                        : 'settings.quick_entry.section_expense',
                    )}
                  </Text>
                  <View style={styles.card} className="bg-card border border-border/30">
                    {renderRow(
                      I18n.t('settings.quick_entry.default_row'),
                      defaultCategory,
                      I18n.t('settings.quick_entry.no_default'),
                      () => setActiveDefault(section),
                    )}
                    {sectionBuckets.map((bucketKey) => {
                      const resolvedId = bucketResolution.get(bucketKey) ?? null;
                      const resolvedCategory = resolvedId
                        ? (categoryById.get(resolvedId) ?? null)
                        : null;
                      const isOverride =
                        quickEntryPrefs.categoryMap[bucketKey] !== undefined &&
                        quickEntryPrefs.categoryMap[bucketKey] !== null;
                      return (
                        <React.Fragment key={bucketKey}>
                          <View style={styles.rowDivider} />
                          {renderRow(
                            bucketLabel(bucketKey),
                            resolvedCategory,
                            I18n.t('settings.quick_entry.unmapped'),
                            () => handleOpenBucket(bucketKey),
                            isOverride ? I18n.t('settings.quick_entry.custom_badge') : undefined,
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </>
        </View>
      </ScrollView>

      <CategoryPickerSheet
        visible={activeBucket !== null}
        parents={
          activeBucket && isIncomeBucket(activeBucket)
            ? incomePicker.parents
            : expensePicker.parents
        }
        childByParent={
          activeBucket && isIncomeBucket(activeBucket)
            ? incomePicker.childByParent
            : expensePicker.childByParent
        }
        selectedCategoryId={activeBucket ? (bucketResolution.get(activeBucket) ?? null) : null}
        onSelect={handlePickBucketCategory}
        onClose={() => setActiveBucket(null)}
        allowParentSelection
      />

      <CategoryPickerSheet
        visible={activeDefault !== null}
        parents={activeDefault === 'income' ? incomePicker.parents : expensePicker.parents}
        childByParent={
          activeDefault === 'income' ? incomePicker.childByParent : expensePicker.childByParent
        }
        selectedCategoryId={
          activeDefault === 'expense'
            ? quickEntryPrefs.defaultExpenseCategoryId
            : activeDefault === 'income'
              ? quickEntryPrefs.defaultIncomeCategoryId
              : null
        }
        onSelect={handlePickDefault}
        onClose={() => setActiveDefault(null)}
        allowParentSelection
      />

      <AccountPickerSheet
        visible={defaultAccountPickerVisible}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={defaultAccount?.id ?? null}
        onSelect={handlePickDefaultAccount}
        onClose={() => setDefaultAccountPickerVisible(false)}
      />

      <CurrencyPickerSheet
        visible={currencyPickerVisible}
        onClose={() => setCurrencyPickerVisible(false)}
        onSelect={handlePickDefaultCurrency}
        selectedCode={pinnedCurrency ?? settings.currencyCode}
        restrictToCodes={enabledCurrencies}
        title={I18n.t('settings.quick_entry.default_currency_label')}
      />
    </SettingsPageLayout>
  );
}
