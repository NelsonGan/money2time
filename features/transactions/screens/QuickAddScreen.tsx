import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { useApp } from '~/context/AppContext';
import {
  type ExpandToDetailedValues,
  QuickAddSheet,
} from '~/features/transactions/components/QuickAddSheet';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { AddTransactionInitialValues } from '~/navigation/rootStack';
import {
  getSpeechPermissions,
  isSpeechRecognitionAvailable,
  requestSpeechPermissions,
} from '~/services/speechRecognition';
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
    transactions,
    createTransaction,
    getTrueHourlyRateForDate,
    quickEntryPrefs,
    updateQuickEntryPrefs,
  } = useApp();

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
    if (Platform.OS !== 'ios') return;
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
    Platform.OS === 'ios' &&
    voiceSupported &&
    !quickEntryPrefs.voiceInputEnabled &&
    !quickEntryPrefs.voicePromptDismissed;

  const handleDismissVoicePrompt = useCallback(() => {
    updateQuickEntryPrefs({ voicePromptDismissed: true });
  }, [updateQuickEntryPrefs]);

  const handleEnableVoice = useCallback(async () => {
    // Mark dismissed unconditionally — whether or not the user accepts the
    // OS permission prompt, we don't want to ask again from here.
    updateQuickEntryPrefs({ voicePromptDismissed: true });
    try {
      const current = await getSpeechPermissions();
      let granted = current.granted;
      if (!granted && current.canAskAgain) {
        const requested = await requestSpeechPermissions();
        granted = requested.granted;
      }
      if (granted) {
        updateQuickEntryPrefs({ voiceInputEnabled: true });
      } else {
        Alert.alert(
          I18n.t('settings.quick_entry.voice.permission_denied_title'),
          I18n.t('settings.quick_entry.voice.permission_denied_message'),
          [
            { text: I18n.t('common.cancel'), style: 'cancel' },
            {
              text: I18n.t('settings.quick_entry.voice.open_settings'),
              onPress: () => void Linking.openSettings(),
            },
          ],
        );
      }
    } catch {
      // ignore — user can retry from settings
    }
  }, [updateQuickEntryPrefs]);

  const handleSubmit = useCallback(
    (input: CreateTransactionInput) => {
      createTransaction(input);
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
      onClose={onClose}
      onSubmit={handleSubmit}
      onExpandToDetailed={onExpandToDetailed ? handleExpand : undefined}
      onOpenQuickEntrySettings={onOpenQuickEntrySettings}
      voicePromptVisible={voicePromptVisible}
      onEnableVoice={handleEnableVoice}
      onDismissVoicePrompt={handleDismissVoicePrompt}
    />
  );
}
