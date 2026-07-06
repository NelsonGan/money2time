import { ChevronRight } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerModal } from '~/components/datePicker';
import { Input, SegmentedToggle, SettingsActionBar, SettingsHeader, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { dayKeyFromDateLocal, formatRelativeDate } from '~/utils/formatters';

type Direction = 'deposit' | 'withdraw';

interface AddContributionScreenProps {
  goalId: string;
  initialMode?: Direction;
  onClose: () => void;
}

const SCROLL_CONTENT = { padding: 20, paddingBottom: 40 } as const;

export function AddContributionScreen({
  goalId,
  initialMode = 'deposit',
  onClose,
}: AddContributionScreenProps) {
  const { goals, settings, addContribution } = useApp();
  const themeColors = useThemeColors();

  const goal = useMemo(() => goals.find((g) => g.id === goalId) ?? null, [goalId, goals]);

  const [direction, setDirection] = useState<Direction>(initialMode);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(dayKeyFromDateLocal(new Date()));
  const [note, setNote] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const currency = goal?.currency ?? settings.currencyCode;
  const currencySymbol = currencySymbolForCode(currency);
  const parsedAmount = Number.parseFloat(amount);
  const canSave = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const handleSave = useCallback(() => {
    if (!canSave || !goal) return;
    const signed = direction === 'withdraw' ? -parsedAmount : parsedAmount;
    const fxRate = goal.fxRate || 1;
    void triggerHaptic('success');
    addContribution({
      goalId: goal.id,
      amount: signed,
      currency: goal.currency,
      reportingCurrency: settings.currencyCode,
      reportingAmount: signed * fxRate,
      fxRate,
      date,
      note: note.trim() || null,
    });
    onClose();
  }, [addContribution, canSave, date, direction, goal, note, onClose, parsedAmount, settings]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pb-3 pt-5"
          onBack={onClose}
          title={goal ? goal.name : I18n.t('goals.contribute_title')}
        />
      </View>

      <ScrollView contentContainerStyle={SCROLL_CONTENT} keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <SegmentedToggle
            value={direction}
            onChange={(value) => {
              void triggerHaptic('selection');
              setDirection(value);
            }}
            options={[
              { value: 'deposit', label: I18n.t('goals.deposit') },
              { value: 'withdraw', label: I18n.t('goals.withdraw') },
            ]}
          />

          <Input
            label={I18n.t('goals.amount_label')}
            variant="currency"
            currencySymbol={currencySymbol}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            autoFocus
          />

          <View className="gap-1.5">
            <Text variant="label" tone="muted">
              {I18n.t('goals.date_label')}
            </Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
            >
              <Text variant="body">{formatRelativeDate(date, settings.locale)}</Text>
              <ChevronRight size={16} color={themeColors.textMuted} />
            </Pressable>
          </View>

          <Input
            label={I18n.t('goals.note_label')}
            variant="multiline"
            value={note}
            onChangeText={setNote}
            placeholder={I18n.t('goals.note_placeholder')}
          />
        </View>
      </ScrollView>

      <SettingsActionBar
        onCancel={onClose}
        onSave={handleSave}
        saveDisabled={!canSave}
        saveLabel={I18n.t('goals.contribute_cta')}
      />

      <DatePickerModal
        visible={showDatePicker}
        value={date}
        title={I18n.t('goals.date_label')}
        onSelect={(next) => {
          setDate(next);
          setShowDatePicker(false);
        }}
        onClose={() => setShowDatePicker(false)}
      />
    </SafeAreaView>
  );
}
