import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { Text, ThemeModal } from '~/components/ui';
import { clampClaimAmount } from '~/features/transactions/lib/reimbursements';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { normalizeMoneyAmount } from '~/utils/formatters';

export interface ClaimDraft {
  payer: string | null;
  amount: number;
  /** Amount tracks the transaction total as the user keeps typing it. */
  claimAll: boolean;
}

interface ClaimSheetProps {
  visible: boolean;
  /** The expense total the claim is cut from, in `currency`. */
  transactionAmount: number;
  currency: string;
  /** Existing claim when re-opening, or null to start a fresh one. */
  claim: ClaimDraft | null;
  /** Payers used before, newest first, for one-tap reuse. */
  recentPayers: string[];
  onClose: () => void;
  onApply: (claim: ClaimDraft) => void;
  onRemove: () => void;
}

/** Two-decimal display for the amount field, without trailing float noise. */
function amountText(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return String(normalizeMoneyAmount(value));
}

/**
 * Attaches a reimbursement claim to the expense being edited: who owes it and
 * how much. No money moves here; clearing happens later on the Reimbursements
 * screen once the payment actually arrives.
 */
export function ClaimSheet({
  visible,
  transactionAmount,
  currency,
  claim,
  recentPayers,
  onClose,
  onApply,
  onRemove,
}: ClaimSheetProps) {
  const themeColors = useThemeColors();
  const [payer, setPayer] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [claimAll, setClaimAll] = useState(true);

  // Seed from the existing claim each time the sheet opens. A brand-new claim
  // defaults to the whole expense, which is what most claims are.
  useEffect(() => {
    if (!visible) return;
    setPayer(claim?.payer ?? recentPayers[0] ?? '');
    setClaimAll(claim?.claimAll ?? true);
    setAmountStr(amountText(claim && !claim.claimAll ? claim.amount : transactionAmount));
  }, [visible, claim, recentPayers, transactionAmount]);

  // While "claim all" is on, the field mirrors the live transaction total.
  useEffect(() => {
    if (!visible || !claimAll) return;
    setAmountStr(amountText(transactionAmount));
  }, [visible, claimAll, transactionAmount]);

  const parsedAmount = clampClaimAmount(Number(amountStr.replace(',', '.')), transactionAmount);
  const canApply = parsedAmount > 0;

  const handleApply = () => {
    if (!canApply) return;
    void triggerHaptic('selection');
    onApply({ payer: payer.trim() || null, amount: parsedAmount, claimAll });
    onClose();
  };

  const handleRemove = () => {
    void triggerHaptic('warning');
    onRemove();
    onClose();
  };

  const fieldStyle = {
    flex: 1,
    color: themeColors.text,
    borderColor: themeColors.border,
    backgroundColor: themeColors.card,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-6" onPress={onClose}>
        <Pressable
          className="w-full max-w-[340px] rounded-[28px] border border-border/30 bg-card p-5"
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="heading">{I18n.t('transactions.reimbursements.claim_sheet_title')}</Text>
          <Text variant="caption" tone="muted" className="mt-1">
            {I18n.t('transactions.reimbursements.claim_sheet_subtitle')}
          </Text>

          <View className="mt-4 gap-1.5">
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.reimbursements.payer_label')}
            </Text>
            <TextInput
              value={payer}
              onChangeText={setPayer}
              placeholder={I18n.t('transactions.reimbursements.payer_placeholder')}
              placeholderTextColor={themeColors.textMuted}
              allowFontScaling={false}
              autoCapitalize="words"
              style={fieldStyle}
            />
            {recentPayers.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ gap: 6, paddingTop: 2 }}
              >
                {recentPayers.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setPayer(name);
                    }}
                    accessibilityRole="button"
                    className="rounded-full bg-secondary/60 px-3 py-1.5 active:opacity-70"
                  >
                    <Text variant="caption" tone="muted">
                      {name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>

          <View className="mt-4 gap-1.5">
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.reimbursements.claim_amount_label')}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text variant="body" tone="muted">
                {currencySymbolForCode(currency)}
              </Text>
              <TextInput
                value={amountStr}
                onChangeText={(text) => {
                  // Typing an amount is an explicit partial claim.
                  if (claimAll) setClaimAll(false);
                  setAmountStr(text);
                }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={themeColors.textMuted}
                allowFontScaling={false}
                style={[fieldStyle, { textAlign: 'right' }]}
              />
            </View>
          </View>

          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setClaimAll((prev) => !prev);
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: claimAll }}
            className="mt-4 flex-row items-center gap-3 active:opacity-70"
          >
            <View
              className="h-5 w-5 items-center justify-center rounded-md border"
              style={{
                borderColor: claimAll ? themeColors.primary : themeColors.border,
                backgroundColor: claimAll ? themeColors.primary : 'transparent',
              }}
            >
              {claimAll ? (
                <Text className="text-white text-[12px] leading-[14px] font-bold">✓</Text>
              ) : null}
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="caption">{I18n.t('transactions.reimbursements.claim_all_label')}</Text>
              <Text variant="label" tone="muted">
                {I18n.t('transactions.reimbursements.claim_all_hint')}
              </Text>
            </View>
          </Pressable>

          <View className="mt-5 flex-row items-center justify-end gap-2.5">
            {claim ? (
              <Pressable
                onPress={handleRemove}
                className="rounded-pill bg-destructive/10 px-4 py-2.5"
                accessibilityRole="button"
              >
                <Text variant="caption" className="text-destructive">
                  {I18n.t('transactions.reimbursements.remove_claim')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={onClose}
                className="rounded-pill bg-secondary/60 px-5 py-2.5"
                accessibilityRole="button"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('common.cancel')}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleApply}
              disabled={!canApply}
              style={{ opacity: canApply ? 1 : 0.4 }}
              className="rounded-pill bg-primary px-5 py-2.5 shadow-glow"
              accessibilityRole="button"
            >
              <Text variant="caption" tone="inverse">
                {I18n.t('transactions.reimbursements.save_claim')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
