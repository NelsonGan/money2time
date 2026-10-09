import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account } from '~/types';
import { formatAmount } from '~/utils/formatters';

/**
 * One-shot celebration shown when a loan's balance first reaches zero. Driven
 * entirely by AppContext's pendingLoanCelebration (the persisted loanPaidOffAt
 * stamp guarantees it never repeats), so it can fire on whatever screen the
 * user happens to be on, exactly like the goal celebration.
 */
export function LoanPayoffOverlay() {
  const {
    pendingLoanCelebration,
    clearLoanCelebration,
    setLoanArchived,
    settings,
    currentMonthWage,
  } = useApp();
  const visible = pendingLoanCelebration != null;

  // Holds the last celebration's data across the dismiss so `<Modal>` stays
  // mounted with `visible` going straight to false, rather than being
  // unmounted while still showing — Fabric tearing down a *visible*
  // ReactModalHostView (instead of the Modal's own dismiss path reacting to
  // `visible={false}`) crashes native modal teardown on both platforms
  // (Sentry MONEY2TIME-3Y on Android). `pendingLoanCelebration` used to gate
  // an early `return null` that unmounted the Modal directly on every dismiss.
  const [content, setContent] = useState<Account | null>(null);

  useEffect(() => {
    if (pendingLoanCelebration) {
      setContent(pendingLoanCelebration);
      void triggerHaptic('success');
    }
  }, [pendingLoanCelebration]);

  if (!content) return null;

  const loanId = content.id;
  const principal = content.loanOriginalPrincipal;
  // In time display mode this reads as the hours of work the loan cost, which
  // is the whole point of the app; in money mode it is just the amount repaid.
  const principalLabel =
    principal != null && principal > 0
      ? formatAmount(principal, settings, {
          showSign: false,
          trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
          currencyCode: content.currency,
        })
      : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={clearLoanCelebration}>
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
          <Mascot name="celebrating" size={112} />
          <Text variant="headingSm" className="mt-5 text-center">
            {I18n.t('accounts.loan.celebration_title')}
          </Text>
          <Text variant="body" tone="muted" className="mt-2 text-center">
            {principalLabel
              ? I18n.t('accounts.loan.celebration_message_with_amount', {
                  name: content.name,
                  amount: principalLabel,
                })
              : I18n.t('accounts.loan.celebration_message', {
                  name: content.name,
                })}
          </Text>
          {/* A settled loan has nothing left to track, so this is the moment
              to offer tidying it away; the accounts list keeps a "show
              archived" toggle for getting it back. */}
          <View className="mt-6 w-full gap-2">
            <Button
              onPress={() => {
                setLoanArchived(loanId, true);
                clearLoanCelebration();
              }}
              accessibilityLabel={I18n.t('accounts.loan.celebration_archive_cta')}
            >
              <Text>{I18n.t('accounts.loan.celebration_archive_cta')}</Text>
            </Button>
            <Button
              variant="secondary"
              onPress={clearLoanCelebration}
              accessibilityLabel={I18n.t('accounts.loan.celebration_keep_cta')}
            >
              <Text>{I18n.t('accounts.loan.celebration_keep_cta')}</Text>
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
