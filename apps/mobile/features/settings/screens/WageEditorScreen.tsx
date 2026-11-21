import React, { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';

import { SelectField, SettingsHeader, SettingsPageLayout } from '~/components/ui';
import { DEFAULT_WAGE_CONFIG } from '~/constants/appDefaults';
import { useApp } from '~/context/AppContext';
import { OnboardingStepLayout } from '~/features/onboarding/components/OnboardingStepLayout';
import { WageForm } from '~/features/settings/components/WageForm';
import {
  buildMonthOptions,
  formatMonthLabel,
  hasHourlyRate,
  latestWageEntry,
  sameWageConfig,
  wageConfigOf,
} from '~/features/settings/lib/wageMonths';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { WageConfig } from '~/types';
import { financialMonthKeyForDate, monthCycleOf } from '~/utils/financialMonth';
import { normalizeMonthKey } from '~/utils/formatters';

interface WageEditorScreenProps {
  /** The month to edit; left out to add a month, picked on the page. */
  monthKey?: string;
  onClose: () => void;
}

/**
 * One month's income rate on one page: the month (when adding one), then the
 * same form as onboarding, with commute and other extra time opening in place.
 */
export function WageEditorScreen({ monthKey, onClose }: WageEditorScreenProps) {
  const { settings, monthlyWages, updateWageConfigForMonth } = useApp();
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const isAdding = !monthKey;

  // Already one entry per month, with `YYYY-MM` keys (monthlyWageRepository.list).
  const history = monthlyWages;

  // Read once: the form owns the values from here on.
  const [initialMonth] = useState(() =>
    monthKey
      ? normalizeMonthKey(monthKey)
      : financialMonthKeyForDate(new Date(), monthCycleOf(settings)),
  );
  const [initialConfig] = useState<WageConfig>(() => {
    // Editing starts from that month; a new month from the latest one, since
    // a raise or a new job usually changes only the pay.
    const entry = monthKey
      ? history.find((item) => item.month === initialMonth)
      : latestWageEntry(history);
    return entry ? wageConfigOf(entry) : { ...DEFAULT_WAGE_CONFIG };
  });
  const [config, setConfig] = useState<WageConfig>(initialConfig);
  const [pickerYear, setPickerYear] = useState(() => initialMonth.slice(0, 4));
  const [pickerMonth, setPickerMonth] = useState(() => initialMonth.slice(5, 7));

  const targetMonth = isAdding ? normalizeMonthKey(`${pickerYear}-${pickerMonth}`) : initialMonth;
  const hasRate = hasHourlyRate(config);

  const monthOptions = useMemo(() => buildMonthOptions(activeLocale), [activeLocale]);
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const fromRange = Array.from({ length: 9 }, (_, i) => String(currentYear - 5 + i));
    const fromData = history.map((item) => item.month.slice(0, 4));
    return Array.from(new Set([...fromRange, ...fromData, pickerYear]))
      .sort((a, b) => Number(b) - Number(a))
      .map((year) => ({ value: year, label: year }));
  }, [history, pickerYear]);

  const save = () => {
    // An untouched month is left as it is: its amount was rounded to cents for
    // the field, and saving that back would move a wage kept in another
    // currency by a fraction on every open.
    if (!isAdding && sameWageConfig(config, initialConfig)) {
      onClose();
      return;
    }
    updateWageConfigForMonth(targetMonth, config);
    void triggerHaptic('success');
    onClose();
  };

  const handleSave = () => {
    if (!hasRate) return;
    // Adding a month that already has a rate replaces it, so ask first.
    if (isAdding && history.some((item) => item.month === targetMonth)) {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('settings.hourly_month_exists_title', {
          month: formatMonthLabel(targetMonth, activeLocale),
        }),
        I18n.t('settings.hourly_month_exists_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          { text: I18n.t('settings.hourly_replace'), onPress: save },
        ],
      );
      return;
    }
    save();
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-1"
        title={
          isAdding
            ? I18n.t('settings.hourly_add_title')
            : formatMonthLabel(initialMonth, activeLocale)
        }
        onBack={onClose}
      />
      <OnboardingStepLayout
        revealBelowOnKeyboard
        primaryLabel={I18n.t('common.save')}
        primaryDisabled={!hasRate}
        onPrimary={handleSave}
      >
        {isAdding ? (
          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <SelectField
                label={I18n.t('settings.month')}
                value={pickerMonth}
                onChange={setPickerMonth}
                options={monthOptions}
              />
            </View>
            <View className="flex-1">
              <SelectField
                label={I18n.t('settings.year')}
                value={pickerYear}
                onChange={setPickerYear}
                options={yearOptions}
              />
            </View>
          </View>
        ) : null}
        <WageForm
          config={config}
          currencySymbol={settings.currencySymbol}
          onChange={setConfig}
          askHoursForHourly
        />
      </OnboardingStepLayout>
    </SettingsPageLayout>
  );
}
