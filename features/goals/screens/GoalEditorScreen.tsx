import { ChevronRight, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerModal } from '~/components/datePicker';
import { Button, Input, SettingsActionBar, SettingsHeader, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { dayKeyFromDateLocal, formatRelativeDate } from '~/utils/formatters';

interface GoalEditorScreenProps {
  goalId?: string;
  onClose: () => void;
}

const SCROLL_CONTENT = { padding: 20, paddingBottom: 40 } as const;

export function GoalEditorScreen({ goalId, onClose }: GoalEditorScreenProps) {
  const { goals, settings, createGoal, updateGoal, deleteGoal } = useApp();
  const themeColors = useThemeColors();

  const existing = useMemo(() => goals.find((g) => g.id === goalId) ?? null, [goalId, goals]);
  const isEditing = existing != null;

  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '');
  const [target, setTarget] = useState(existing ? String(existing.targetAmount) : '');
  const [startingAmount, setStartingAmount] = useState(
    existing && existing.startingAmount > 0 ? String(existing.startingAmount) : '',
  );
  const [hasDeadline, setHasDeadline] = useState(existing?.deadline != null);
  const [deadline, setDeadline] = useState(existing?.deadline ?? dayKeyFromDateLocal(new Date()));
  const [note, setNote] = useState(existing?.note ?? '');
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const parsedTarget = Number.parseFloat(target);
  const canSave = name.trim().length > 0 && Number.isFinite(parsedTarget) && parsedTarget > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    const parsedStarting = Number.parseFloat(startingAmount);
    const starting = Number.isFinite(parsedStarting) && parsedStarting > 0 ? parsedStarting : 0;
    void triggerHaptic('success');
    if (isEditing && existing) {
      // Currency/fxRate stay fixed once contributions are frozen against them;
      // v1 goals are always in the reporting currency (fxRate = 1).
      updateGoal(existing.id, {
        name: name.trim(),
        emoji: emoji.trim() || null,
        targetAmount: parsedTarget,
        targetReportingAmount: parsedTarget * (existing.fxRate || 1),
        startingAmount: starting,
        deadline: hasDeadline ? deadline : null,
        note: note.trim() || null,
      });
    } else {
      createGoal({
        name: name.trim(),
        emoji: emoji.trim() || null,
        targetAmount: parsedTarget,
        currency: settings.currencyCode,
        fxRate: 1,
        targetReportingAmount: parsedTarget,
        startingAmount: starting,
        deadline: hasDeadline ? deadline : null,
        note: note.trim() || null,
        trackingMode: 'manual',
      });
    }
    onClose();
  }, [
    canSave,
    createGoal,
    deadline,
    emoji,
    existing,
    hasDeadline,
    isEditing,
    name,
    note,
    onClose,
    parsedTarget,
    settings.currencyCode,
    startingAmount,
    updateGoal,
  ]);

  const handleDelete = useCallback(() => {
    if (!existing) return;
    void triggerHaptic('warning');
    Alert.alert(I18n.t('goals.delete_title'), I18n.t('goals.delete_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteGoal(existing.id);
          onClose();
        },
      },
    ]);
  }, [deleteGoal, existing, onClose]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pb-3 pt-5"
          onBack={onClose}
          title={isEditing ? I18n.t('goals.edit_title') : I18n.t('goals.add_title')}
          rightAccessory={
            isEditing ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
              >
                <Trash2 size={18} color={themeColors.coral} />
              </Pressable>
            ) : undefined
          }
        />
      </View>

      <ScrollView contentContainerStyle={SCROLL_CONTENT} keyboardShouldPersistTaps="handled">
        <View className="gap-4">
          <View className="flex-row gap-3">
            <View className="w-[84px]">
              <Input
                label={I18n.t('goals.emoji_label')}
                value={emoji}
                onChangeText={(text) => setEmoji([...text].slice(-1).join(''))}
                placeholder="🎯"
                autoCapitalize="none"
              />
            </View>
            <View className="flex-1">
              <Input
                label={I18n.t('goals.name_label')}
                value={name}
                onChangeText={setName}
                placeholder={I18n.t('goals.name_placeholder')}
              />
            </View>
          </View>

          <Input
            label={I18n.t('goals.target_label')}
            variant="currency"
            currencySymbol={currencySymbol}
            value={target}
            onChangeText={setTarget}
            placeholder="0.00"
          />

          <Input
            label={I18n.t('goals.starting_label')}
            variant="currency"
            currencySymbol={currencySymbol}
            value={startingAmount}
            onChangeText={setStartingAmount}
            placeholder="0.00"
          />

          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text variant="body">{I18n.t('goals.deadline_toggle')}</Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t('goals.deadline_hint')}
              </Text>
            </View>
            <Switch
              value={hasDeadline}
              onValueChange={(v) => {
                void triggerHaptic('selection');
                setHasDeadline(v);
              }}
              trackColor={{ true: themeColors.primary }}
            />
          </View>

          {hasDeadline ? (
            <View className="gap-1.5">
              <Text variant="label" tone="muted">
                {I18n.t('goals.deadline_label')}
              </Text>
              <Pressable
                onPress={() => setShowDeadlinePicker(true)}
                className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
              >
                <Text variant="body">{formatRelativeDate(deadline, settings.locale)}</Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <Input
            label={I18n.t('goals.note_label')}
            variant="multiline"
            value={note}
            onChangeText={setNote}
            placeholder={I18n.t('goals.note_placeholder')}
          />

          {!isEditing ? (
            <Button onPress={handleSave} disabled={!canSave}>
              <Text style={{ color: '#fff' }} variant="bodyStrong">
                {I18n.t('goals.create_cta')}
              </Text>
            </Button>
          ) : null}
        </View>
      </ScrollView>

      {isEditing ? (
        <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
      ) : null}

      <DatePickerModal
        visible={showDeadlinePicker}
        value={deadline}
        title={I18n.t('goals.deadline_label')}
        onSelect={(date) => {
          setDeadline(date);
          setShowDeadlinePicker(false);
        }}
        onClose={() => setShowDeadlinePicker(false)}
      />
    </SafeAreaView>
  );
}
