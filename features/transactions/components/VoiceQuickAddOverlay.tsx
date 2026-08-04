import { useSpeechRecognitionEvent } from 'expo-speech-recognition';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet } from 'react-native';

import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp, useTransactions } from '~/context/AppContext';
import { usePro } from '~/context/ProContext';
import { I18n } from '~/lib/i18n';
import { type CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { requestOpenPaywall } from '~/services/paywallNavigation';
import {
  abortListening,
  getSpeechPermissions,
  requestSpeechPermissions,
  startListening,
  stopListening,
} from '~/services/speechRecognition';
import { requestHighlightTransaction } from '~/services/transactionsNavigation';
import {
  publishVoiceCapture,
  publishVoiceSessionEnded,
  subscribeInlineVoiceHost,
} from '~/services/voiceCaptureBridge';
import type { Account, Category, TransactionType } from '~/types';
import { dayKeyFromDateLocal } from '~/utils/formatters';

import { findFallbackCategory, pickDefaultAccountId } from '../lib/entryDefaults';
import { matchCategoryByKeywords } from '../utils/categoryKeywords';
import { categorizeFromHistory } from '../utils/historyCategorizer';
import { parseQuickInput, stripCurrencyTokens } from '../utils/parseQuickInput';
import { VoiceCaptureOverlay } from './VoiceCaptureOverlay';
import { type VoicePreviewData, VoicePreviewSheet } from './VoicePreviewSheet';

export interface VoiceQuickAddHandle {
  /** Start listening. Caller should also call stop() in onPressOut. */
  start: () => void;
  /**
   * Start listening in tap mode: the caller does NOT hold, so the capture
   * overlay becomes tap-to-stop instead of release-to-stop. Used by the add
   * options sheet and a tap-configured + button.
   */
  startTap: () => void;
  /** Stop listening — triggers recognition + preview. */
  stop: () => void;
  /** Abandon the session without recognising anything. Used when the user backs
   *  out of the capture UI, where a preview would be an unwanted result. */
  cancel: () => void;
  /** True if currently recording. */
  isRecording: () => boolean;
}

interface VoiceQuickAddOverlayProps {
  onEditDetailed?: (input: CreateTransactionInput) => void;
  /** Attaches a handle so the BottomNav can drive the lifecycle. */
  handleRef: React.MutableRefObject<VoiceQuickAddHandle | null>;
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
    createTransaction,
    quickEntryPrefs,
    updateQuickEntryPrefs,
    isSimpleMode,
    simpleWalletId,
  } = useApp();
  const { transactions } = useTransactions();
  const { isPro } = usePro();

  const [recording, setRecording] = useState(false);
  const [tapMode, setTapMode] = useState(false);
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
  // When the previous session ended. iOS's SFSpeechRecognizer needs a brief
  // settle window between teardown and the next start, otherwise the next
  // startListening can silently no-op or get torn down by stale events.
  const lastSessionEndAtRef = useRef(0);
  // Monotonic session counter. Each start() bumps this; an in-flight start
  // that finds a newer generation after its async waits bails out.
  // Also used to reject the user releasing the button while we're waiting
  // for the inter-session gap (stop() bumps it).
  const sessionGenRef = useRef(0);

  const buildPreviewData = useCallback(
    (transcript: string): VoicePreviewData | null => {
      const trimmed = transcript.trim();
      if (!trimmed) return null;
      const parsed = parseQuickInput(trimmed);
      if (!parsed.amount || parsed.amount <= 0) return null;
      const type: TransactionType = 'expense';

      const note = stripCurrencyTokens(parsed.note);
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
        if (!accountId && quickEntryPrefs.defaultAccountId) {
          const defaultExists = accounts.some((a) => a.id === quickEntryPrefs.defaultAccountId);
          if (defaultExists) accountId = quickEntryPrefs.defaultAccountId;
        }
        if (!accountId) {
          accountId = pickDefaultAccountId(accounts);
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
      quickEntryPrefs.defaultAccountId,
      quickEntryPrefs.defaultExpenseCategoryId,
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
        // suppressed by the staleness guard if it fires within the guard
        // window of the most recent start, which would otherwise leave the
        // overlay stuck.
        setLiveTranscript('');
        recordingRef.current = false;
        setRecording(false);
        lastSessionEndAtRef.current = Date.now();
        void triggerHaptic('success');
        requestHighlightTransaction(createTransaction(input, { source: 'voice' }));
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
  //
  // Stale-event guard: iOS can deliver `end`, `error('aborted'|'no-speech')`,
  // and late isFinal `result` events from a previous session up to a few
  // hundred ms after we've kicked off a new one. The guards reject events
  // whose timestamp falls in the suspect window of the most recent start.
  // The result handler intentionally does NOT gate on `recordingRef.current`
  // because `stop()` already clears it before iOS finishes delivering the
  // current session's isFinal — gating there would drop legit transcripts
  // for short utterances.
  useSpeechRecognitionEvent('result', (event) => {
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
    // The end of the *current* session always has recordingRef=false by the
    // time it fires (stop() sets it). So when recordingRef is still true and
    // an end fires, it's a stale signal from the previous session (possibly
    // delayed by hundreds of ms from our pre-start abort). Suppress it for a
    // wide window — wider than the gap we wait in start() — so a stale end
    // never tears down a freshly-started session.
    if (recordingRef.current && Date.now() - lastStartAtRef.current < 1200) return;
    recordingRef.current = false;
    setRecording(false);
    setLiveTranscript('');
    lastSessionEndAtRef.current = Date.now();
  });
  useSpeechRecognitionEvent('error', (event) => {
    const code = event?.error ?? 'unknown';
    const sinceStart = Date.now() - lastStartAtRef.current;
    // The very first ms after our startListening is a danger zone: the
    // abort+start sequence can make iOS fire a delayed 'aborted' or even a
    // generic transient error against the brand-new task. Suppress
    // everything in this window while recording is active — if the session
    // is truly dead, no real audio events will follow and the user can
    // release to retry.
    if (recordingRef.current && sinceStart < 350) {
      return;
    }
    // 'aborted' and 'no-speech' are routine session-end signals. If they fire
    // shortly after a new start, they're from the previously-aborted session
    // and must not tear down the new one. Real errors are always processed.
    if ((code === 'aborted' || code === 'no-speech') && sinceStart < 800) {
      return;
    }
    setRecording(false);
    recordingRef.current = false;
    setLiveTranscript('');
    lastSessionEndAtRef.current = Date.now();
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
    if (recordingRef.current) return;

    // Claim a session id up-front. Any wait below re-checks this — if the
    // user released during the wait (stop() bumps the gen) or another start
    // beat us to it, we bail out without flipping the listening overlay on.
    const myGen = ++sessionGenRef.current;

    // Permission gate: if not granted, prompt once then bail (caller can retry).
    const current = await getSpeechPermissions();
    if (myGen !== sessionGenRef.current) return;
    let granted = current.granted;
    if (!granted && current.canAskAgain) {
      const requested = await requestSpeechPermissions();
      if (myGen !== sessionGenRef.current) return;
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
      publishVoiceSessionEnded();
      return;
    }

    // Free-tier lifetime-uses gate. Pro is always unlimited. Holding without
    // speaking still counts — the paywall fires on the (limit+1)th hold.
    if (!isPro) {
      const used = quickEntryPrefs.voiceUsageCount;
      if (used >= PRO_LIMITS.FREE_VOICE_TOTAL_USES) {
        void trackEvent(AnalyticsEvents.PRO_LIMIT_HIT, { type: 'voice' });
        requestOpenPaywall(
          'voice',
          I18n.t('pro.limit_voice', { count: PRO_LIMITS.FREE_VOICE_TOTAL_USES }),
        );
        // Roll back our session-gen claim so a follow-up press isn't stuck
        // behind a stale "in-flight" gen.
        sessionGenRef.current--;
        publishVoiceSessionEnded();
        return;
      }
      updateQuickEntryPrefs({ voiceUsageCount: used + 1 });
    }

    hasReceivedResultRef.current = false;

    // Tear down any lingering native session FIRST, then wait for iOS to
    // fully settle before the next startListening. The two-phase approach is
    // what fixes "subsequent listening flashes and disappears": calling
    // abort + start back-to-back leaves SFSpeechRecognizer in a transient
    // state that fires a delayed 'aborted' or generic error against our
    // brand-new task, which would otherwise tear down the new session.
    //
    // For the very first session of an app lifetime we have nothing to
    // drain, so we skip both the abort and the wait — keeps the first press
    // snappy. Subsequent sessions always pay the settle window.
    if (lastSessionEndAtRef.current > 0) {
      abortListening();
      // Events emitted by the abort fire during the wait below while
      // recordingRef is still false, so the handlers no-op. The wait absorbs
      // both the abort settle time AND any residual gap from the previous
      // session's teardown.
      const sinceLastEnd = Date.now() - lastSessionEndAtRef.current;
      const MIN_PRESTART_WAIT_MS = 250;
      const settleMs = Math.max(MIN_PRESTART_WAIT_MS, 500 - sinceLastEnd);
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      if (myGen !== sessionGenRef.current) return;
    }

    // Stamp lastStartAtRef now — events the new startListening() emits will
    // be measured against this. The guards above are tuned around this base.
    lastStartAtRef.current = Date.now();
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
      // the guard window.
      lastStartAtRef.current = 0;
      hasReceivedResultRef.current = false;
      sessionGenRef.current++;
      Alert.alert(
        I18n.t('settings.quick_entry.voice.error_title'),
        err instanceof Error ? err.message : I18n.t('settings.quick_entry.voice.error_message'),
      );
      publishVoiceSessionEnded();
    }
  }, [isPro, quickEntryPrefs.voiceUsageCount, settings.locale, updateQuickEntryPrefs]);

  /**
   * Tear the session down without recognising anything. `stop` would hand the
   * audio to the recogniser and surface a preview, which is exactly wrong when
   * the user has just backed out of the capture UI.
   */
  const cancel = useCallback(() => {
    sessionGenRef.current++;
    const wasRecording = recordingRef.current;
    recordingRef.current = false;
    setRecording(false);
    setLiveTranscript('');
    lastSessionEndAtRef.current = Date.now();
    abortListening();
    // The recording->false effect only fires for a session that had started;
    // signal directly when it had not, so an inline host still hears the end.
    if (!wasRecording) publishVoiceSessionEnded();
  }, []);

  const stop = useCallback(() => {
    // Bump the session gen even when not yet recording — this cancels an
    // in-flight start() that's waiting on permissions or the inter-session
    // gap. Without this, a fast tap-and-release would let the deferred
    // startListening() fire after the user has already let go, leaving a
    // phantom listening overlay until iOS's no-speech timeout.
    sessionGenRef.current++;
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    lastSessionEndAtRef.current = Date.now();
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
      start: () => {
        setTapMode(false);
        void start();
      },
      startTap: () => {
        setTapMode(true);
        void start();
      },
      stop: () => void stop(),
      cancel: () => cancel(),
      isRecording: () => recordingRef.current,
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, start, stop, cancel]);

  // Tap mode ends whenever recording stops (tap-to-stop, silence auto-finalize,
  // background abort, or error) so the tap-catcher never blocks the UI.
  useEffect(() => {
    if (!recording) setTapMode(false);
  }, [recording]);

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
    requestHighlightTransaction(createTransaction(input, { source: 'voice' }));
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

  // A surface with room of its own (the + sheet) can draw the capture UI inline;
  // while one does, this full-screen overlay stands down so the two are never
  // both on screen.
  const [inlineHosted, setInlineHosted] = useState(false);
  useEffect(() => subscribeInlineVoiceHost(setInlineHosted), []);

  const captureHint = tapMode
    ? I18n.t('settings.quick_entry.voice.tap_stop_hint')
    : I18n.t('settings.quick_entry.voice.release_hint');
  useEffect(() => {
    publishVoiceCapture({ recording, liveTranscript, hint: captureHint });
  }, [recording, liveTranscript, captureHint]);

  // Every session that actually started ends here, whichever way it ended —
  // stop, the native end event, or the background abort. The paths that bail
  // before recording ever goes true signal it themselves inside start().
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (recording) {
      wasRecordingRef.current = true;
      return;
    }
    if (wasRecordingRef.current) {
      wasRecordingRef.current = false;
      publishVoiceSessionEnded();
    }
  }, [recording]);

  // If the app goes to the background while we're recording, abort the native
  // session. iOS may suspend SFSpeechRecognizer mid-utterance and never fire
  // `end`, which would leave `recordingRef.current = true` and block the next
  // long-press from starting a fresh session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && recordingRef.current) {
        sessionGenRef.current++;
        recordingRef.current = false;
        setRecording(false);
        setLiveTranscript('');
        lastSessionEndAtRef.current = Date.now();
        abortListening();
      }
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      {inlineHosted ? null : tapMode ? (
        // Tap mode: a full-screen catcher above the (pointer-events-none)
        // capture overlay turns the whole screen into a tap-to-stop target.
        <Pressable
          style={StyleSheet.absoluteFill}
          pointerEvents={recording ? 'auto' : 'none'}
          onPress={() => stop()}
        >
          <VoiceCaptureOverlay
            visible={recording}
            liveTranscript={liveTranscript}
            hint={captureHint}
          />
        </Pressable>
      ) : (
        <VoiceCaptureOverlay visible={recording} liveTranscript={liveTranscript} />
      )}
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
