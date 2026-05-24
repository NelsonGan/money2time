import { Check, Pencil, X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, Category, UserSettings } from '~/types';
import { formatAmount } from '~/utils/formatters';

export interface VoicePreviewData {
  rawTranscript: string;
  amount: number;
  note: string;
  type: 'expense' | 'income';
  date: string;
  account: Account | null;
  category: Category | null;
}

interface VoicePreviewSheetProps {
  visible: boolean;
  data: VoicePreviewData | null;
  settings: UserSettings;
  onDiscard: () => void;
  onApprove: () => void;
  onEdit: () => void;
}

const HEADER_EXPENSE_COLOR = '#E25A6A';
const HEADER_INCOME_COLOR = '#16A34A';

export function VoicePreviewSheet({
  visible,
  data,
  settings,
  onDiscard,
  onApprove,
  onEdit,
}: VoicePreviewSheetProps) {
  const themeColors = useThemeColors();
  const accent = useMemo(() => {
    if (!data) return themeColors.primary;
    return data.type === 'income' ? HEADER_INCOME_COLOR : HEADER_EXPENSE_COLOR;
  }, [data, themeColors.primary]);

  if (!visible || !data) return null;

  const amountLabel = formatAmount(
    data.type === 'income' ? data.amount : -data.amount,
    settings,
    { showSign: true },
  );

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDiscard} />
      <View
        style={[
          styles.card,
          {
            backgroundColor: themeColors.card,
            borderColor: themeColors.border,
          },
        ]}
      >
        <Text variant="caption" tone="muted" style={styles.heardLabel}>
          {I18n.t('settings.quick_entry.voice.preview_heard')}
        </Text>
        <Text variant="bodyStrong" style={styles.transcript} numberOfLines={3}>
          {data.rawTranscript || '—'}
        </Text>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Text variant="caption" tone="muted" style={styles.rowLabel}>
            {I18n.t('settings.quick_entry.voice.preview_amount')}
          </Text>
          <Text variant="bodyStrong" style={[styles.rowValue, { color: accent }]}>
            {amountLabel}
          </Text>
        </View>

        <View style={styles.row}>
          <Text variant="caption" tone="muted" style={styles.rowLabel}>
            {I18n.t('settings.quick_entry.voice.preview_category')}
          </Text>
          <View style={styles.rowValueRow}>
            <Text style={styles.emoji}>{data.category?.icon || '🏷️'}</Text>
            <Text variant="body" style={[styles.rowValue, { color: themeColors.text }]}>
              {data.category?.name ?? I18n.t('common.uncategorized')}
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text variant="caption" tone="muted" style={styles.rowLabel}>
            {I18n.t('settings.quick_entry.voice.preview_account')}
          </Text>
          <Text variant="body" style={[styles.rowValue, { color: themeColors.text }]}>
            {data.account?.name ?? I18n.t('common.no_account')}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onDiscard();
            }}
            style={[
              styles.actionButton,
              styles.actionGhost,
              { borderColor: themeColors.border },
            ]}
            accessibilityLabel={I18n.t('settings.quick_entry.voice.discard')}
          >
            <X size={18} color={themeColors.text} />
            <Text style={[styles.actionLabel, { color: themeColors.text }]}>
              {I18n.t('settings.quick_entry.voice.discard')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onEdit();
            }}
            style={[
              styles.actionButton,
              styles.actionGhost,
              { borderColor: themeColors.border },
            ]}
            accessibilityLabel={I18n.t('settings.quick_entry.voice.edit')}
          >
            <Pencil size={18} color={themeColors.text} />
            <Text style={[styles.actionLabel, { color: themeColors.text }]}>
              {I18n.t('settings.quick_entry.voice.edit')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void triggerHaptic('success');
              onApprove();
            }}
            style={[styles.actionButton, styles.actionPrimary, { backgroundColor: accent }]}
            accessibilityLabel={I18n.t('settings.quick_entry.voice.save')}
          >
            <Check size={18} color="#FFFFFF" strokeWidth={3} />
            <Text style={[styles.actionLabel, { color: '#FFFFFF' }]}>
              {I18n.t('settings.quick_entry.voice.save')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    zIndex: 999,
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  heardLabel: {
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  transcript: {
    fontSize: 16,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  rowLabel: {
    fontSize: 12,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emoji: {
    fontSize: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionGhost: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  actionPrimary: {
    borderWidth: 0,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
