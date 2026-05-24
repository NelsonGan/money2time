import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';

import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { type CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { triggerHaptic } from '~/services/haptics';
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

function findFallbackCategory(categories: Category[], type: TransactionType): Category | null {
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
    accountGroups,
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
  // Tracks whether the active native session produced any transcript. When
  // false, stop() uses abort() instead of stop() to skip the lengthy
  // "no-speech" error path that can leave the recognizer in a state which
  // blocks the next session from starting.
  const hasReceivedResultRef = useRef(false);
  // Timestamp of the most recent start(). Event handlers use this to ignore
  // stale `end`/`error` events from a previously-aborted session that may
  // fire after a brand-new session has been kicked off.
  const lastStartAtRef = useRef(0);

  const buildPreviewData = useCallback(
    (transcript: string): VoicePreviewData | null => {
      const trimmed = transcript.trim();
      if (!trimmed) return null;
      const parsed = parseQuickInput(trimmed);
      if (!parsed.amount || parsed.amount <= 0) return null;
      const type: TransactionType = 'expense';

      const note = parsed.note.trim();
      const historyMatch = note ? categorizeFromHistory(note, transactions, { type }) : null;

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

      // Account priority: 1) history match, 2) user-picked default,
      // 3) first account. Simple-mode short-circuits to the simple wallet.
      // We validate each candidate against the live accounts list — history
      // can hand back a soft-deleted account id, in which case we must fall
      // through to the user's chosen default rather than persisting null.
      let accountId: string | null = historyMatch?.accountId ?? null;
      if (accountId && !accounts.some((a) => a.id === accountId)) {
        accountId = null;
      }
      if (isSimpleMode && simpleWalletId) {
        accountId = simpleWalletId;
      } else {
        if (!accountId && quickEntryPrefs.voiceDefaultAccountId) {
          const defaultExists = accounts.some(
            (a) => a.id === quickEntryPrefs.voiceDefaultAccountId,
          );
          if (defaultExists) accountId = quickEntryPrefs.voiceDefaultAccountId;
        }
        if (!accountId) {
          accountId = pickDefaultAccount(accounts)?.id ?? null;
        }
      }

      const account = accounts.find((a) => a.id === accountId) ?? null;
      const category = categories.find((c) => c.id === categoryId) ?? null;

      return {
        rawTranscript: trimmed,
        amount: parsed.amount,
        note,
        type,
        date: dayKeyFromDateLocal(new Date()),
        account,
        category,
      };
    },
    [
      accounts,
      categories,
      isSimpleMode,
      quickEntryPrefs.categoryMap,
      quickEntryPrefs.defaultExpenseCategoryId,
      quickEntryPrefs.voiceDefaultAccountId,
      simpleWalletId,
      transactions,
    ],
  );

  const finalizeTranscript = useCallback(
    (transcript: string) => {
      const trimmed = transcript.trim();
      if (!trimmed) {
        setPreview(null);
        return;
      }
      const data = buildPreviewData(trimmed);
      if (!data) {
        // Hide the capture overlay first so the live transcript doesn't sit
        // behind the alert.
        setLiveTranscript('');
        Alert.alert(
          I18n.t('settings.quick_entry.voice.no_amount_title'),
          I18n.t('settings.quick_entry.voice.no_amount_message', { transcript: trimmed }),
        );
        return;
      }
      // Skip-confirmation requires a real account to charge. Without one the
      // preview path is safer — at least the user sees the "No account" row
      // and can pick one before saving instead of producing an orphan record.
      if (quickEntryPrefs.voiceSkipConfirmation && data.account) {
        const input: CreateTransactionInput = {
          type: data.type,
          amount: data.amount,
          currency: settings.currencyCode,
          date: data.date,
          note: data.note.length > 0 ? data.note : null,
          sentiment: 'neutral',
          accountId: data.account.id,
          categoryId: data.category?.id ?? null,
        };
        // Clear capture UI immediately; the corresponding `end` event may be
        // suppressed by the staleness guard if it fires within 150ms of the
        // most recent start, which would otherwise leave the overlay stuck.
        setLiveTranscript('');
        recordingRef.current = false;
        setRecording(false);
        void triggerHaptic('success');
        createTransaction(input);
        return;
      }
      setPreview(data);
    },
    [
      buildPreviewData,
      createTransaction,
      quickEntryPrefs.voiceSkipConfirmation,
      settings.currencyCode,
    ],
  );

  // Native speech events come via the library's hook. The hook handles
  // attach/detach internally, so we just describe what to do with each event.
  // The 150ms windows below filter out events that belong to a session we
  // already aborted in start() — the native side can deliver them after the
  // new session has begun and we'd otherwise clobber its state.
  useSpeechRecognitionEvent('result', (event) => {
    // A stale isFinal from the previous session can otherwise fire
    // finalizeTranscript on old audio and (with skip-confirmation) silently
    // create a phantom transaction.
    if (Date.now() - lastStartAtRef.current < 150) return;
    const transcript = event.results?.[0]?.transcript ?? '';
    // Trim before checking — iOS often emits a single-space interim before
    // any real recognition, which would otherwise flip the fast-abort path.
    if (transcript.trim().length > 0) hasReceivedResultRef.current = true;
    if (event.isFinal) {
      setLiveTranscript(transcript);
      finalizeTranscript(transcript);
    } else {
      setLiveTranscript(transcript);
    }
  });
  useSpeechRecognitionEvent('end', () => {
    // Only suppress when there's an active session that a stale end could
    // tear down. With recordingRef already false (stop() ran), processing is
    // a no-op for recording state anyway.
    if (recordingRef.current && Date.now() - lastStartAtRef.current < 150) return;
    recordingRef.current = false;
    setRecording(false);
    setLiveTranscript('');
  });
  useSpeechRecognitionEvent('error', (event) => {
    const code = event?.error ?? 'unknown';
    // 'aborted' and 'no-speech' are routine session-end signals. If they fire
    // shortly after a new start, they're from the previously-aborted session
    // and must not tear down the new one. Real errors are always processed.
    if ((code === 'aborted' || code === 'no-speech') && Date.now() - lastStartAtRef.current < 150) {
      return;
    }
    setRecording(false);
    recordingRef.current = false;
    setLiveTranscript('');
    if (code !== 'aborted' && code !== 'no-speech') {
      // Belt-and-braces for real failures: tear down the native recognizer so
      // it doesn't sit half-alive holding the mic until the user retries.
      abortListening();
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

    // Stamp lastStartAtRef BEFORE the abort so any synchronous end/error
    // event the abort emits is correctly recognized as belonging to the new
    // session window (and gets suppressed by the 150ms guards above).
    lastStartAtRef.current = Date.now();
    hasReceivedResultRef.current = false;

    // Belt-and-braces: forcibly tear down any zombie native session before
    // starting a fresh one. Without this, a previous quick cancel can leave
    // SFSpeechRecognizer in a "starting" state where the next start silently
    // no-ops.
    abortListening();

    setLiveTranscript('');
    recordingRef.current = true;
    setRecording(true);
    try {
      startListening({ lang: localeToBcp47(settings.locale) });
    } catch (err) {
      recordingRef.current = false;
      setRecording(false);
      // Roll back the start markers too — otherwise the failed attempt's
      // timestamp would suppress legit events from the user's retry within
      // the next 150ms.
      lastStartAtRef.current = 0;
      hasReceivedResultRef.current = false;
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
    // If the user released without speaking, abort instead of stop. Abort
    // tears the recognizer down immediately, sidestepping the slow no-speech
    // error path that's the usual culprit for "next long-press doesn't work".
    // `hasReceivedResultRef` is only set on trimmed-non-empty transcripts so
    // an iOS whitespace-only interim doesn't push us onto the slow path.
    if (hasReceivedResultRef.current) {
      stopListening();
    } else {
      abortListening();
    }
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

  const handleUpdateCategory = useCallback((category: Category | null) => {
    setPreview((prev) => (prev ? { ...prev, category } : prev));
  }, []);

  const handleUpdateAccount = useCallback((account: Account | null) => {
    setPreview((prev) => (prev ? { ...prev, account } : prev));
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
        accounts={accounts}
        accountGroups={accountGroups}
        categories={categories}
        allowAccountEdit={!isSimpleMode}
        onApprove={handleApprove}
        onEdit={handleEdit}
        onDiscard={handleDiscard}
        onUpdateCategory={handleUpdateCategory}
        onUpdateAccount={handleUpdateAccount}
      />
    </>
  );
}
