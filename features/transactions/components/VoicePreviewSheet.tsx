import { Check, ChevronRight, Pencil, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AccountPickerSheet,
  CategoryEmoji,
  CategoryPickerSheet,
  type CategoryPickerOption,
  Text,
} from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup, Category, UserSettings } from '~/types';
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
  accounts: Account[];
  accountGroups: AccountGroup[];
  categories: Category[];
  /** When false (simple mode), the account row is non-interactive. */
  allowAccountEdit: boolean;
  onDiscard: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onUpdateCategory: (category: Category | null) => void;
  onUpdateAccount: (account: Account | null) => void;
}

const HEADER_EXPENSE_COLOR = '#E25A6A';
const HEADER_INCOME_COLOR = '#16A34A';

function buildCategoryPickerOptions(categories: Category[]): {
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

export function VoicePreviewSheet({
  visible,
  data,
  settings,
  accounts,
  accountGroups,
  categories,
  allowAccountEdit,
  onDiscard,
  onApprove,
  onEdit,
  onUpdateCategory,
  onUpdateAccount,
}: VoicePreviewSheetProps) {
  const themeColors = useThemeColors();
  const accent = useMemo(() => {
    if (!data) return themeColors.primary;
    return data.type === 'income' ? HEADER_INCOME_COLOR : HEADER_EXPENSE_COLOR;
  }, [data, themeColors.primary]);
  const [activePicker, setActivePicker] = useState<'category' | 'account' | null>(null);

  // Voice entries are always expense, so we never want a minus sign on the
  // amount — the destructive red color already communicates "money out".
  const eligibleCategories = useMemo(
    () => categories.filter((c) => (data ? c.type === data.type : false)),
    [categories, data],
  );
  const categoryPickerOptions = useMemo(
    () => buildCategoryPickerOptions(eligibleCategories),
    [eligibleCategories],
  );

  if (!visible || !data) return null;

  const amountLabel = formatAmount(Math.abs(data.amount), settings, { showSign: false });
  const noteText =
    data.note.trim().length > 0
      ? data.note
      : I18n.t('settings.quick_entry.voice.preview_note_empty');

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
        <View style={styles.row}>
          <Text variant="caption" tone="muted" style={styles.rowLabel}>
            {I18n.t('settings.quick_entry.voice.preview_note')}
          </Text>
          <Text
            variant="bodyStrong"
            style={[styles.rowValue, styles.noteValue, { color: themeColors.text }]}
            numberOfLines={2}
          >
            {noteText}
          </Text>
        </View>

        <View style={styles.row}>
          <Text variant="caption" tone="muted" style={styles.rowLabel}>
            {I18n.t('settings.quick_entry.voice.preview_amount')}
          </Text>
          <Text variant="bodyStrong" style={[styles.rowValue, { color: accent }]}>
            {amountLabel}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            setActivePicker('category');
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('settings.quick_entry.voice.preview_category')}
        >
          <View style={styles.row}>
            <Text variant="caption" tone="muted" style={styles.rowLabel}>
              {I18n.t('settings.quick_entry.voice.preview_category')}
            </Text>
            <View style={styles.rowValueRow}>
              <CategoryEmoji icon={data.category?.icon || '🏷️'} size={16} style={styles.emoji} />
              <Text
                variant="body"
                style={[styles.rowValue, { color: themeColors.text }]}
                numberOfLines={1}
              >
                {data.category?.name ?? I18n.t('common.uncategorized')}
              </Text>
              <ChevronRight size={14} color={themeColors.textMuted} />
            </View>
          </View>
        </Pressable>

        {allowAccountEdit ? (
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setActivePicker('account');
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('settings.quick_entry.voice.preview_account')}
          >
            <View style={styles.row}>
              <Text variant="caption" tone="muted" style={styles.rowLabel}>
                {I18n.t('settings.quick_entry.voice.preview_account')}
              </Text>
              <View style={styles.rowValueRow}>
                <Text
                  variant="body"
                  style={[styles.rowValue, { color: themeColors.text }]}
                  numberOfLines={1}
                >
                  {data.account?.name ?? I18n.t('common.no_account')}
                </Text>
                <ChevronRight size={14} color={themeColors.textMuted} />
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={styles.row}>
            <Text variant="caption" tone="muted" style={styles.rowLabel}>
              {I18n.t('settings.quick_entry.voice.preview_account')}
            </Text>
            <Text
              variant="body"
              style={[styles.rowValue, { color: themeColors.text }]}
              numberOfLines={1}
            >
              {data.account?.name ?? I18n.t('common.no_account')}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onDiscard();
            }}
            style={[styles.actionButton, styles.actionGhost, { borderColor: themeColors.border }]}
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
            style={[styles.actionButton, styles.actionGhost, { borderColor: themeColors.border }]}
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

      <CategoryPickerSheet
        visible={activePicker === 'category'}
        parents={categoryPickerOptions.parents}
        childByParent={categoryPickerOptions.childByParent}
        selectedCategoryId={data.category?.id ?? null}
        onSelect={(id) => {
          const next = categories.find((c) => c.id === id) ?? null;
          onUpdateCategory(next);
          setActivePicker(null);
        }}
        onClose={() => setActivePicker(null)}
        allowParentSelection
        overlay
      />

      <AccountPickerSheet
        visible={activePicker === 'account'}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={data.account?.id ?? null}
        onSelect={(id) => {
          const next = accounts.find((a) => a.id === id) ?? null;
          onUpdateAccount(next);
          setActivePicker(null);
        }}
        onClose={() => setActivePicker(null)}
        overlay
      />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 28,
  },
  rowLabel: {
    fontSize: 12,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  noteValue: {
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '70%',
  },
  rowValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
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
