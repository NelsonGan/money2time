import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';

import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { type CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import {
  abortListening,
  getSpeechPermissions,
  requestSpeechPermissions,
  startListening,
  stopListening,
} from '~/services/speechRecognition';
import type { Account, Category, TransactionType } from '~/types';
import { dayKeyFromDateLocal } from '~/utils/formatters';

import { VoiceCaptureOverlay } from './VoiceCaptureOverlay';
import { VoicePreviewSheet, type VoicePreviewData } from './VoicePreviewSheet';
import { matchCategoryByKeywords } from '../utils/categoryKeywords';
import { categorizeFromHistory } from '../utils/historyCategorizer';
import { parseQuickInput } from '../utils/parseQuickInput';

export interface VoiceQuickAddHandle {
  /** Start listening. Caller should also call stop() in onPressOut. */
  start: () => void;
  /** Stop listening — triggers recognition + preview. */
  stop: () => void;
  /** True if currently recording. */
  isRecording: () => boolean;
}

interface VoiceQuickAddOverlayProps {
  onEditDetailed?: (input: CreateTransactionInput) => void;
  /** Attaches a handle so the BottomNav can drive the lifecycle. */
  handleRef: React.MutableRefObject<VoiceQuickAddHandle | null>;
}

function pickDefaultAccount(accounts: Account[]): Account | null {
  // AppContext already returns accounts sorted by sortOrder, so the first
  // element is the user's primary account.
  return accounts[0] ?? null;
}

function findFallbackCategory(
  categories: Category[],
  type: TransactionType,
): Category | null {
  const sameType = categories.filter((c) => c.type === type);
  if (sameType.length === 0) return null;
  const other = sameType.find((c) => /^other/i.test(c.name));
  // Prefer the first category by user sort order if no "Other" exists — it's
  // the most predictable pick (last item was order-dependent + surprising).
  return other ?? sameType[0] ?? null;
}

function localeToBcp47(appLocale: string): string {
  if (appLocale.startsWith('zh')) return 'zh-CN';
  return 'en-US';
}

export function VoiceQuickAddOverlay({ onEditDetailed, handleRef }: VoiceQuickAddOverlayProps) {
  const {
    settings,
    accounts,
    categories,
    transactions,
    createTransaction,
    quickEntryPrefs,
    isSimpleMode,
    simpleWalletId,
  } = useApp();

  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [preview, setPreview] = useState<VoicePreviewData | null>(null);
  const recordingRef = useRef(false);

  const finalizeTranscript = useCallback(
    (transcript: string) => {
      const trimmed = transcript.trim();
      if (!trimmed) {
        setPreview(null);
        return;
      }
      const parsed = parseQuickInput(trimmed);
      if (!parsed.amount || parsed.amount <= 0) {
        // Hide the capture overlay first so the live transcript doesn't sit
        // behind the alert.
        setLiveTranscript('');
        Alert.alert(
          I18n.t('settings.quick_entry.voice.no_amount_title'),
          I18n.t('settings.quick_entry.voice.no_amount_message', { transcript: trimmed }),
        );
        return;
      }
      // Default to expense; income inference is hard from short transcripts.
      const type: TransactionType = 'expense';

      // Try history match first for category + account.
      const note = parsed.note.trim();
      const historyMatch = note
        ? categorizeFromHistory(note, transactions, { type })
        : null;

      let categoryId: string | null = historyMatch?.categoryId ?? null;
      if (!categoryId && note) {
        const kw = matchCategoryByKeywords(note, categories, quickEntryPrefs.categoryMap);
        categoryId = kw?.categoryId ?? null;
      }
      if (!categoryId) {
        categoryId =
          quickEntryPrefs.defaultExpenseCategoryId ??
          findFallbackCategory(categories, type)?.id ??
          null;
      }

      let accountId: string | null = historyMatch?.accountId ?? null;
      if (isSimpleMode && simpleWalletId) {
        accountId = simpleWalletId;
      } else if (!accountId) {
        accountId = pickDefaultAccount(accounts)?.id ?? null;
      }

      const account = accounts.find((a) => a.id === accountId) ?? null;
      const category = categories.find((c) => c.id === categoryId) ?? null;

      setPreview({
        rawTranscript: trimmed,
        amount: parsed.amount,
        note,
        type,
        date: dayKeyFromDateLocal(new Date()),
        account,
        category,
      });
    },
    [
      accounts,
      categories,
      isSimpleMode,
      quickEntryPrefs.categoryMap,
      quickEntryPrefs.defaultExpenseCategoryId,
      simpleWalletId,
      transactions,
    ],
  );

  // Native speech events come via the library's hook. The hook handles
  // attach/detach internally, so we just describe what to do with each event.
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    if (event.isFinal) {
      setLiveTranscript(transcript);
      finalizeTranscript(transcript);
    } else {
      setLiveTranscript(transcript);
    }
  });
  useSpeechRecognitionEvent('end', () => {
    // Keep ref and visible state in lockstep so the next long-press can start
    // a fresh session even if a `result` never arrived.
    recordingRef.current = false;
    setRecording(false);
    setLiveTranscript('');
  });
  useSpeechRecognitionEvent('error', (event) => {
    setRecording(false);
    recordingRef.current = false;
    setLiveTranscript('');
    // Belt-and-braces: tell the native side to fully abort so a stale
    // `result` from this dead session can't leak into the next one.
    abortListening();
    const code = event?.error ?? 'unknown';
    if (code !== 'aborted' && code !== 'no-speech') {
      Alert.alert(
        I18n.t('settings.quick_entry.voice.error_title'),
        event?.message || I18n.t('settings.quick_entry.voice.error_message'),
      );
    }
  });

  const start = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    if (recordingRef.current) return;

    // Permission gate: if not granted, prompt once then bail (caller can retry).
    const current = await getSpeechPermissions();
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const requested = await requestSpeechPermissions();
      granted = requested.granted;
    }
    if (!granted) {
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
      return;
    }

    setLiveTranscript('');
    recordingRef.current = true;
    setRecording(true);
    try {
      startListening({ lang: localeToBcp47(settings.locale) });
    } catch (err) {
      recordingRef.current = false;
      setRecording(false);
      Alert.alert(
        I18n.t('settings.quick_entry.voice.error_title'),
        err instanceof Error ? err.message : I18n.t('settings.quick_entry.voice.error_message'),
      );
    }
  }, [settings.locale]);

  const stop = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    stopListening();
  }, []);

  // Expose imperative handle so BottomNav can drive long-press lifecycle.
  useEffect(() => {
    handleRef.current = {
      start: () => void start(),
      stop: () => void stop(),
      isRecording: () => recordingRef.current,
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, start, stop]);

  const handleApprove = useCallback(() => {
    if (!preview) return;
    const input: CreateTransactionInput = {
      type: preview.type,
      amount: preview.amount,
      currency: settings.currencyCode,
      date: preview.date,
      note: preview.note.length > 0 ? preview.note : null,
      sentiment: 'neutral',
      accountId: preview.account?.id ?? null,
      categoryId: preview.category?.id ?? null,
    };
    setPreview(null);
    createTransaction(input);
  }, [createTransaction, preview, settings.currencyCode]);

  const handleEdit = useCallback(() => {
    if (!preview) return;
    const input: CreateTransactionInput = {
      type: preview.type,
      amount: preview.amount,
      currency: settings.currencyCode,
      date: preview.date,
      note: preview.note.length > 0 ? preview.note : null,
      sentiment: 'neutral',
      accountId: preview.account?.id ?? null,
      categoryId: preview.category?.id ?? null,
    };
    setPreview(null);
    onEditDetailed?.(input);
  }, [onEditDetailed, preview, settings.currencyCode]);

  const handleDiscard = useCallback(() => {
    setPreview(null);
    abortListening();
  }, []);

  // If the app goes to the background while we're recording, abort the native
  // session. iOS may suspend SFSpeechRecognizer mid-utterance and never fire
  // `end`, which would leave `recordingRef.current = true` and block the next
  // long-press from starting a fresh session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && recordingRef.current) {
        recordingRef.current = false;
        setRecording(false);
        setLiveTranscript('');
        abortListening();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <VoiceCaptureOverlay visible={recording} liveTranscript={liveTranscript} />
      <VoicePreviewSheet
        visible={preview !== null}
        data={preview}
        settings={settings}
        onApprove={handleApprove}
        onEdit={handleEdit}
        onDiscard={handleDiscard}
      />
    </>
  );
}
