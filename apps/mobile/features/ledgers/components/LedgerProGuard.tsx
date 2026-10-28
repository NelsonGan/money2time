import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CategoryEmoji, Text, ThemeModal } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { sharedLedgerFor } from '~/features/cloudSync/services/sharedLedgerStore';
import { useLedgerLock } from '~/features/sharedLedgers/hooks/useSharedLedgers';
import { DEFAULT_LEDGER_ID } from '~/lib/db/ledgerScope';
import { I18n } from '~/lib/i18n';

import { ledgerDisplayName, ledgerIcon } from '../lib/ledgerDisplay';

/**
 * The closed ledger's name while its notice is unseen, so a notice held back
 * by the app lock, or lost to the app closing, still shows on the next launch.
 */
const PENDING_NOTICE_KEY = '@m2t/ledger_pro_ended_notice/v1';

interface LedgerProGuardProps {
  /**
   * Whether the app is on its main screens, with no editor open. The switch
   * waits for it: an open editor holds the closing ledger's accounts and
   * categories, and saving one after the switch would mix the two ledgers.
   */
  canSwitch: boolean;
  /** Hold the notice while another prompt or the app lock is up. */
  suppressed: boolean;
  onRenewPro: () => void;
}

/**
 * Ledgers other than the default one are Pro. When Pro ends (RevenueCat has
 * answered free; a read that failed or has not come back yet says nothing,
 * so an offline Pro user keeps their ledger) while one is open, this opens
 * the default ledger and says so once. Nothing is deleted: the other ledgers
 * show a lock in the switcher and open again as they were when Pro is back.
 * A ledger someone shared with the user follows its owner's Pro instead: it
 * closes the same way when it is paused.
 */
export function LedgerProGuard({ canSwitch, suppressed, onRenewPro }: LedgerProGuardProps) {
  const { activeLedger, ledgers, switchLedger } = useApp();
  const { isPro, isStatusKnown, customerState } = usePro();
  // A real answer from RevenueCat, not the placeholder a failed read leaves.
  const hasAnswer = isStatusKnown && customerState !== null;
  const insets = useSafeAreaInsets();
  const lockOf = useLedgerLock();
  // The name of the ledger that was closed, while the notice is due.
  const [closedLedgerName, setClosedLedgerName] = useState<string | null>(null);
  // Closed because its owner's Pro ended, not the user's.
  const [closedPaused, setClosedPaused] = useState<{ owner: string } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PENDING_NOTICE_KEY)
      .then((name) => {
        if (name) setClosedLedgerName(name);
      })
      .catch(() => undefined);
  }, []);

  // A joined ledger that is paused closes whatever the user's own Pro.
  useEffect(() => {
    if (!canSwitch || lockOf(activeLedger.id) !== 'paused') return;
    setClosedPaused({ owner: sharedLedgerFor(activeLedger.id)?.ownerName ?? '' });
    setClosedLedgerName(ledgerDisplayName(activeLedger));
    switchLedger(DEFAULT_LEDGER_ID);
  }, [activeLedger, canSwitch, lockOf, switchLedger]);

  useEffect(() => {
    if (!hasAnswer) return;
    if (isPro && !closedPaused) {
      // Renewed before an unseen notice showed: it no longer applies.
      setClosedLedgerName(null);
      AsyncStorage.removeItem(PENDING_NOTICE_KEY).catch(() => undefined);
      return;
    }
    if (!canSwitch || lockOf(activeLedger.id) !== 'pro') return;
    const name = ledgerDisplayName(activeLedger);
    setClosedLedgerName(name);
    AsyncStorage.setItem(PENDING_NOTICE_KEY, name).catch(() => undefined);
    switchLedger(DEFAULT_LEDGER_ID);
  }, [activeLedger, canSwitch, closedPaused, hasAnswer, isPro, lockOf, switchLedger]);

  const defaultLedger = ledgers.find((ledger) => ledger.id === DEFAULT_LEDGER_ID) ?? activeLedger;
  const dismiss = () => {
    setClosedLedgerName(null);
    setClosedPaused(null);
    AsyncStorage.removeItem(PENDING_NOTICE_KEY).catch(() => undefined);
  };

  return (
    <ThemeModal
      visible={
        closedLedgerName != null && !suppressed && (closedPaused != null || !(hasAnswer && isPro))
      }
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={dismiss}
    >
      <Pressable
        className="flex-1 justify-end bg-black/50 px-4"
        style={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }}
        onPress={dismiss}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="items-center gap-3 rounded-[30px] border border-border/30 bg-background p-6 shadow-float"
          testID="ledger-pro-ended"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-secondary/60">
            <CategoryEmoji icon={ledgerIcon(defaultLedger)} size={34} />
          </View>
          <Text variant="subheading" className="text-center">
            {I18n.t('ledgers.pro_ended_title', { name: ledgerDisplayName(defaultLedger) })}
          </Text>
          <Text variant="body" tone="muted" className="text-center">
            {closedPaused
              ? I18n.t('shared_ledgers.paused_body', {
                  owner: closedPaused.owner,
                  name: closedLedgerName ?? '',
                })
              : I18n.t('ledgers.pro_ended_message', { name: closedLedgerName ?? '' })}
          </Text>
          {closedPaused ? (
            <Button className="mt-2 w-full" onPress={dismiss}>
              <Text>{I18n.t('common.done')}</Text>
            </Button>
          ) : (
            <View className="mt-2 w-full flex-row gap-3">
              <Button variant="secondary" className="flex-1" onPress={dismiss}>
                <Text>{I18n.t('common.done')}</Text>
              </Button>
              <Button
                className="flex-1"
                testID="ledger-pro-ended-renew"
                onPress={() => {
                  dismiss();
                  onRenewPro();
                }}
              >
                <Text>{I18n.t('ledgers.renew_pro')}</Text>
              </Button>
            </View>
          )}
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
