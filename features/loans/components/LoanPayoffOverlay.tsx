import React, { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatAmount } from '~/utils/formatters';

/**
 * One-shot celebration shown when a loan's balance first reaches zero. Driven
 * entirely by AppContext's pendingLoanCelebration (the persisted loanPaidOffAt
 * stamp guarantees it never repeats), so it can fire on whatever screen the
 * user happens to be on, exactly like the goal celebration.
 */
export function LoanPayoffOverlay() {
  const { pendingLoanCelebration, clearLoanCelebration, settings, currentMonthWage } = useApp();
  const visible = pendingLoanCelebration != null;

  useEffect(() => {
    if (visible) void triggerHaptic('success');
  }, [visible]);

  if (!pendingLoanCelebration) return null;

  const principal = pendingLoanCelebration.loanOriginalPrincipal;
  // In time display mode this reads as the hours of work the loan cost, which
  // is the whole point of the app; in money mode it is just the amount repaid.
  const principalLabel =
    principal != null && principal > 0
      ? formatAmount(principal, settings, {
          showSign: false,
          trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
          currencyCode: pendingLoanCelebration.currency,
        })
      : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={clearLoanCelebration}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-8"
        onPress={clearLoanCelebration}
      >
        <Pressable
          className="w-full max-w-[360px] items-center rounded-[28px] bg-card px-6 py-8"
          onPress={() => {}}
        >
          {/* The mascot carries the moment on its own. The goal celebration
              pairs it with the goal's own emoji, which is the user's pick and
              means something; a generic bill icon here would just be a second
              picture competing with the first. */}
          <Mascot mood="proud" size={112} />
          <Text variant="headingSm" className="mt-5 text-center">
            {I18n.t('accounts.loan.celebration_title')}
          </Text>
          <Text variant="body" tone="muted" className="mt-2 text-center">
            {principalLabel
              ? I18n.t('accounts.loan.celebration_message_with_amount', {
                  name: pendingLoanCelebration.name,
                  amount: principalLabel,
                })
              : I18n.t('accounts.loan.celebration_message', {
                  name: pendingLoanCelebration.name,
                })}
          </Text>
          <View className="mt-6 w-full">
            <Button onPress={clearLoanCelebration} accessibilityLabel={I18n.t('common.done')}>
              <Text>{I18n.t('accounts.loan.celebration_cta')}</Text>
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
