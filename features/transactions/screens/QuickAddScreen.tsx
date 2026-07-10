import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useApp, useTransactions } from '~/context/AppContext';
import { FeatureAnnouncementModal } from '~/features/news/components/FeatureAnnouncementModal';
import { getFeatureAnnouncementById } from '~/features/news/featureAnnouncements';
import {
  type ExpandToDetailedValues,
  QuickAddSheet,
} from '~/features/transactions/components/QuickAddSheet';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { AddTransactionInitialValues } from '~/navigation/rootStack';
import { isSpeechRecognitionAvailable } from '~/services/speechRecognition';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import { dayKeyFromDateLocal } from '~/utils/formatters';

interface QuickAddScreenProps {
  onClose: () => void;
  onSubmitReady?: (input: CreateTransactionInput) => void;
  onExpandToDetailed?: (
    initialValues: AddTransactionInitialValues,
    initialAccountId: string | undefined,
  ) => void;
  onOpenQuickEntrySettings?: () => void;
  isSimpleMode?: boolean;
  simpleWalletId?: string | null;
  initialAccountId?: string;
  initialValues?: AddTransactionInitialValues;
}

export function QuickAddScreen({
  onClose,
  onSubmitReady,
  onExpandToDetailed,
  onOpenQuickEntrySettings,
  isSimpleMode,
  simpleWalletId,
  initialAccountId,
  initialValues,
}: QuickAddScreenProps) {
  const {
    settings,
    accounts,
    accountGroups,
    categories,
    createTransaction,
    getTrueHourlyRateForDate,
    quickEntryPrefs,
    updateQuickEntryPrefs,
    fxCurrencies,
    rateTable,
  } = useApp();
  const { transactions } = useTransactions();

  // Currencies the user can enter quick-add amounts in: the reporting currency,
  // their sub-currencies, and any currency an account already uses.
  const enabledCurrencies = useMemo(() => {
    const set = new Set<string>([settings.currencyCode, ...fxCurrencies]);
    for (const account of accounts) {
      if (account.currency) set.add(account.currency);
    }
    return Array.from(set);
  }, [accounts, fxCurrencies, settings.currencyCode]);

  const handleChangeEntryCurrency = useCallback(
    (code: string) => {
      updateQuickEntryPrefs({ defaultCurrency: code });
    },
    [updateQuickEntryPrefs],
  );

  const today = useMemo(() => dayKeyFromDateLocal(new Date()), []);
  const initialDate = initialValues?.date ?? today;
  const trueHourlyRate = useMemo(
    () => getTrueHourlyRateForDate(initialDate),
    [getTrueHourlyRateForDate, initialDate],
  );

  // Probe voice support once on mount. The banner is only shown when the
  // device actually supports speech recognition and the user hasn't either
  // enabled it or dismissed the suggestion yet.
  const [voiceSupported, setVoiceSupported] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isSpeechRecognitionAvailable();
      if (!cancelled) setVoiceSupported(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const voicePromptVisible =
    voiceSupported && !quickEntryPrefs.voiceInputEnabled && !quickEntryPrefs.voicePromptDismissed;

  // Enabling from the prompt opens the voice announcement (which carries the
  // showcase and an in-place enable toggle) rather than sending the user off to
  // settings.
  const voiceAnnouncement = useMemo(
    () => getFeatureAnnouncementById('voice_transactions_2026_06'),
    [],
  );
  const [voiceAnnouncementVisible, setVoiceAnnouncementVisible] = useState(false);

  const handleDismissVoicePrompt = useCallback(() => {
    updateQuickEntryPrefs({ voicePromptDismissed: true });
  }, [updateQuickEntryPrefs]);

  const handleEnableVoice = useCallback(() => {
    setVoiceAnnouncementVisible(true);
    updateQuickEntryPrefs({ voicePromptDismissed: true });
  }, [updateQuickEntryPrefs]);

  const handleSubmit = useCallback(
    (input: CreateTransactionInput) => {
      const id = createTransaction(input);
      requestHighlightTransaction(id);
      onSubmitReady?.(input);
    },
    [createTransaction, onSubmitReady],
  );

  const handleExpand = useCallback(
    (values: ExpandToDetailedValues) => {
      if (!onExpandToDetailed) return;
      const carry: AddTransactionInitialValues = {
        type: values.type,
        amount: values.amount,
        date: values.date,
        accountId: values.accountId,
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        categoryId: values.categoryId,
        note: values.note,
      };
      const accountForRoute =
        values.accountId ?? values.fromAccountId ?? initialAccountId ?? undefined;
      onExpandToDetailed(carry, accountForRoute);
    },
    [initialAccountId, onExpandToDetailed],
  );

  return (
    <>
      <QuickAddSheet
        settings={settings}
        accounts={accounts}
        accountGroups={accountGroups}
        categories={categories}
        transactions={transactions}
        isSimpleMode={!!isSimpleMode}
        simpleWalletId={simpleWalletId ?? null}
        initialAccountId={initialAccountId}
        initialType={initialValues?.type}
        initialDate={initialDate}
        initialAmount={initialValues?.amount}
        initialNote={initialValues?.note}
        initialCategoryId={initialValues?.categoryId ?? null}
        trueHourlyRate={trueHourlyRate}
        quickEntryPrefs={quickEntryPrefs}
        enabledCurrencies={enabledCurrencies}
        rateTable={rateTable}
        onChangeEntryCurrency={handleChangeEntryCurrency}
        onClose={onClose}
        onSubmit={handleSubmit}
        onExpandToDetailed={onExpandToDetailed ? handleExpand : undefined}
        onOpenQuickEntrySettings={onOpenQuickEntrySettings}
        voicePromptVisible={voicePromptVisible}
        onEnableVoice={handleEnableVoice}
        onDismissVoicePrompt={handleDismissVoicePrompt}
      />
      {voiceAnnouncement ? (
        <FeatureAnnouncementModal
          announcement={voiceAnnouncement}
          visible={voiceAnnouncementVisible}
          onDismiss={() => setVoiceAnnouncementVisible(false)}
        />
      ) : null}
    </>
  );
}
