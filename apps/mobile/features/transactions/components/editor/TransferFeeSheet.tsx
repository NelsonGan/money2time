import { ChevronRight, Tag } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { AccountLogo, CategoryEmoji, Text } from '~/components/ui';
import {
  type CategoryPickerOption,
  CategoryPickerSheet,
} from '~/components/ui/CategoryPickerSheet';
import { ThemeModal } from '~/components/ui/theme-modal';
import {
  canChargeTransferFee,
  defaultTransferFeeSide,
  TRANSFER_FEE_PERCENTS,
  type TransferFeeDraft,
  transferFeePercentOf,
  type TransferFeeSide,
  transferFeeTotals,
} from '~/features/transactions/lib/transferFee';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, normalizeMoneyAmount } from '~/utils/formatters';

import { evaluateExpression, sanitizeInitialAmount } from './calculatorEngine';
import { MiniNumpad } from './MiniNumpad';

type SheetAccount = Pick<Account, 'id' | 'name' | 'currency' | 'logoId' | 'type' | 'goalEmoji'>;

interface TransferFeeSheetProps {
  visible: boolean;
  /** The transfer's amount, in the from account's currency. */
  amount: number;
  /** What the transfer credits, in the to account's currency. */
  received: number;
  fromAccount: SheetAccount | null;
  toAccount: SheetAccount | null;
  /** The fee as it stands; null when the transfer has none yet. */
  fee: TransferFeeDraft | null;
  /** The category a new fee starts in. */
  defaultCategoryId: string | null;
  categoryParents: CategoryPickerOption[];
  categoryChildByParent: Map<string, CategoryPickerOption[]>;
  categoryPreviewById: ReadonlyMap<string, { name: string; icon: string | null | undefined }>;
  onClose: () => void;
  /** Done (null when the amount is 0) or Remove fee (null). */
  onApply: (fee: TransferFeeDraft | null) => void;
}

/**
 * The transfer editor's fee: how much, which account paid it (from: more
 * leaves; to: less arrives) and the category it is filed under. Quick
 * percentages cover card top-ups. See `features/transactions/lib/transferFee.ts`.
 */
export function TransferFeeSheet({
  visible,
  amount,
  received,
  fromAccount,
  toAccount,
  fee,
  defaultCategoryId,
  categoryParents,
  categoryChildByParent,
  categoryPreviewById,
  onClose,
  onApply,
}: TransferFeeSheetProps) {
  const themeColors = useThemeColors();
  const sheetColumnStyle = useSheetColumnStyle();

  const [expression, setExpression] = useState('');
  // Remounts the pad when the sheet opens or a percentage fills the amount, so
  // it starts from the value shown.
  const [padKey, setPadKey] = useState(0);
  const [side, setSide] = useState<TransferFeeSide>('from');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setExpression(fee ? sanitizeInitialAmount(String(normalizeMoneyAmount(fee.amount))) : '');
    setPadKey((key) => key + 1);
    setSide(fee?.side ?? defaultTransferFeeSide(fromAccount, toAccount));
    setCategoryId(fee?.categoryId ?? defaultCategoryId);
    setCategoryPickerOpen(false);
    // Seeded each time the sheet opens, not on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const feeAmount = useMemo(
    () => normalizeMoneyAmount(evaluateExpression(expression)),
    [expression],
  );
  const payingAccount = side === 'to' ? toAccount : fromAccount;
  const feeCurrency = payingAccount?.currency ?? fromAccount?.currency ?? '';
  const percentBase = side === 'to' ? received : amount;
  const format = useCallback(
    (value: number, currency: string) => formatCurrency(value, currencySymbolForCode(currency)),
    [],
  );
  const totals = transferFeeTotals({ amount, received, fee: feeAmount, side });
  const summary =
    feeAmount > 0
      ? side === 'to'
        ? toAccount
          ? I18n.t('transactions.editor.transfer_fee.arrives', {
              account: toAccount.name,
              amount: format(totals.arrives, toAccount.currency),
            })
          : null
        : fromAccount
          ? I18n.t('transactions.editor.transfer_fee.leaves', {
              account: fromAccount.name,
              amount: format(totals.leaves, fromAccount.currency),
            })
          : null
      : I18n.t('transactions.editor.transfer_fee.hint');

  const handlePercent = useCallback(
    (percent: number) => {
      void triggerHaptic('selection');
      const value = transferFeePercentOf(percentBase, percent);
      setExpression(sanitizeInitialAmount(String(value)));
      setPadKey((key) => key + 1);
    },
    [percentBase],
  );

  const handleSide = useCallback((next: TransferFeeSide) => {
    void triggerHaptic('selection');
    setSide(next);
  }, []);

  const handleDone = useCallback(() => {
    if (feeAmount > 0 && !canChargeTransferFee(payingAccount)) {
      void triggerHaptic('warning');
      return;
    }
    void triggerHaptic(feeAmount > 0 ? 'success' : 'selection');
    onApply(feeAmount > 0 ? { amount: feeAmount, side, categoryId } : null);
  }, [categoryId, feeAmount, onApply, payingAccount, side]);

  const handleRemove = useCallback(() => {
    void triggerHaptic('selection');
    onApply(null);
  }, [onApply]);

  const category = categoryId ? (categoryPreviewById.get(categoryId) ?? null) : null;

  const renderSide = (value: TransferFeeSide, account: SheetAccount | null) => {
    const selected = side === value;
    const chargeable = canChargeTransferFee(account);
    const label =
      account?.name ??
      (value === 'from' ? I18n.t('transactions.editor.from') : I18n.t('transactions.editor.to'));
    return (
      <Pressable
        onPress={() => handleSide(value)}
        disabled={!chargeable}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: !chargeable }}
        accessibilityLabel={label}
        // Only colours change with the selection: a shadow class added after
        // the first render makes NativeWind remount the view.
        className={cn(
          'h-9 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-full border px-2.5 active:opacity-70',
          selected ? 'border-border/40 bg-card' : 'border-transparent',
          chargeable ? null : 'opacity-50',
        )}
      >
        {account ? (
          <AccountLogo
            logoId={account.logoId}
            type={account.type}
            goalEmoji={account.goalEmoji}
            size={16}
          />
        ) : null}
        <Text
          variant="caption"
          numberOfLines={1}
          className={cn(
            'shrink',
            selected ? 'font-semibold text-primary' : 'text-muted-foreground',
          )}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable accessible={false} className="absolute inset-0 bg-black/40" onPress={onClose} />
        <View className="overflow-hidden rounded-t-[28px] bg-background" style={sheetColumnStyle}>
          <View className="items-center pt-2.5">
            <View className="h-1 w-10 rounded-full bg-border/60" />
          </View>
          <View className="items-center px-6 pt-4">
            <Text variant="subheading">{I18n.t('transactions.editor.transfer_fee.title')}</Text>
            {amount > 0 && fromAccount ? (
              <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
                {I18n.t('transactions.editor.transfer_fee.subtitle', {
                  amount: format(amount, fromAccount.currency),
                })}
              </Text>
            ) : null}
            <View className="mt-3 flex-row items-baseline gap-1">
              <Text variant="subheading" tone="muted">
                {currencySymbolForCode(feeCurrency)}
              </Text>
              <Text
                variant="display"
                numberOfLines={1}
                adjustsFontSizeToFit
                accessibilityLabel={I18n.t('transactions.editor.transfer_fee.amount_label')}
              >
                {expression || '0'}
              </Text>
            </View>
            {summary ? (
              <Text variant="caption" tone="muted" numberOfLines={1} className="mt-1">
                {summary}
              </Text>
            ) : null}
          </View>

          {percentBase > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, flexGrow: 1 }}
              className="mt-3 grow-0"
            >
              {TRANSFER_FEE_PERCENTS.map((percent) => {
                const value = transferFeePercentOf(percentBase, percent);
                const selected = feeAmount > 0 && Math.abs(value - feeAmount) < 0.005;
                return (
                  <Pressable
                    key={percent}
                    onPress={() => handlePercent(percent)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={I18n.t('transactions.editor.transfer_fee.percent_label', {
                      percent: `${percent}%`,
                    })}
                    className={cn(
                      'h-8 flex-1 items-center justify-center rounded-full border px-3 active:opacity-70',
                      selected
                        ? 'border-primary/40 bg-primary/15'
                        : 'border-border/30 bg-secondary/60',
                    )}
                  >
                    <Text
                      variant="caption"
                      className={selected ? 'font-semibold text-primary' : ''}
                    >
                      {`${percent}%`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          <View className="mx-4 mt-3 overflow-hidden rounded-2xl border border-border/30 bg-secondary/30">
            <View className="gap-2 px-3 pb-2.5 pt-3">
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.editor.transfer_fee.charged_to')}
              </Text>
              <View
                accessibilityRole="radiogroup"
                className="flex-row gap-1 rounded-full bg-secondary/80 p-1"
              >
                {renderSide('from', fromAccount)}
                {renderSide('to', toAccount)}
              </View>
            </View>
            <View className="ml-14 h-[1px] bg-border/30" />
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setCategoryPickerOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('transactions.editor.category')}
              accessibilityValue={category ? { text: category.name } : undefined}
              className="min-h-[48px] flex-row items-center gap-3 px-3 py-2 active:bg-secondary/60"
            >
              <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                <Tag size={16} color={themeColors.primary} />
              </View>
              <Text variant="body" numberOfLines={1} className="shrink">
                {I18n.t('transactions.editor.category')}
              </Text>
              <View className="flex-1" />
              {category ? (
                <View className="max-w-[55%] shrink flex-row items-center gap-1.5">
                  <CategoryEmoji icon={category.icon} size={18} />
                  <Text variant="body" tone="muted" numberOfLines={1} className="shrink">
                    {category.name}
                  </Text>
                </View>
              ) : null}
              <ChevronRight size={16} color={themeColors.textMuted} />
            </Pressable>
          </View>

          {fee ? (
            <Pressable
              onPress={handleRemove}
              accessibilityRole="button"
              hitSlop={6}
              className="mt-2 self-center px-3 py-1.5 active:opacity-70"
            >
              <Text variant="caption" tone="error" className="font-semibold">
                {I18n.t('transactions.editor.transfer_fee.remove')}
              </Text>
            </Pressable>
          ) : (
            <View className="h-3" />
          )}

          <MiniNumpad
            key={padKey}
            initialExpression={expression}
            onValueChange={setExpression}
            onConfirm={handleDone}
          />
        </View>

        <CategoryPickerSheet
          overlay
          visible={categoryPickerOpen}
          onClose={() => setCategoryPickerOpen(false)}
          parents={categoryParents}
          childByParent={categoryChildByParent}
          allowParentSelection
          selectedCategoryId={categoryId}
          onSelect={(next) => {
            setCategoryId(next);
            setCategoryPickerOpen(false);
          }}
        />
      </View>
    </ThemeModal>
  );
}
