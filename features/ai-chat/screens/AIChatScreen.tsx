import { Download, Settings, Shield, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  CardContent,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { TransactionEditorScreen } from '~/features/transactions/components';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { triggerHaptic } from '~/services/haptics';
import type { Account, Category } from '~/types';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { dayKeyFromDateLocal, dayKeyFromIsoLocal } from '~/utils/formatters';
import { newId } from '~/utils/id';

import { ChatInput, type ChatInputMentionOption } from '../components/ChatInput';
import { TransactionPreviewCard } from '../components/TransactionPreviewCard';
import { AI_CHAT_DEFAULT_MODEL } from '../constants/models';
import type { LLMTransactionOutput } from '../constants/prompts';
import {
  alignParsedTransactionAmounts,
  buildSystemPrompt,
  hasExplicitDateReference,
  looksLikeTransactionMessage,
  normalizeTransactionDate,
  normalizeTransactionNote,
  prepareUserMessageForParsing,
  resolveCategoryByName,
  resolveNameToId,
} from '../constants/prompts';
import * as aiActivationService from '../services/aiActivationService';
import * as llamaService from '../services/llamaService';
import * as modelDownloadService from '../services/modelDownloadService';
import * as modelManager from '../services/modelManager';

const NO_DEFAULT_ACCOUNT_OPTION_VALUE = '__none__';
const NO_DEFAULT_INCOME_CATEGORY_OPTION_VALUE = '__none_income_category__';
const GATE_BUTTON_CONTENT_COLOR = '#14181f';
const PREVIEW_REJECT_EXIT_DURATION_MS = 350;

interface ExplicitMentionResolution {
  mention: string;
  start: number;
  end: number;
  entityType: 'account' | 'expense_category' | 'income_category';
  id: string;
  name: string;
}

function resolveExplicitMentions(
  userMessage: string,
  accounts: Account[],
  categories: Category[],
): ExplicitMentionResolution[] {
  const candidates: ExplicitMentionResolution[] = [
    ...accounts.map((account) => ({
      mention: `@${account.name}`,
      start: -1,
      end: -1,
      entityType: 'account' as const,
      id: account.id,
      name: account.name,
    })),
    ...categories.map((category) => ({
      mention: `@${category.name}`,
      start: -1,
      end: -1,
      entityType:
        category.type === 'expense' ? ('expense_category' as const) : ('income_category' as const),
      id: category.id,
      name: category.name,
    })),
  ].sort((left, right) => right.mention.length - left.mention.length);

  const normalizedMessage = userMessage.toLowerCase();
  const occupiedRanges: { start: number; end: number }[] = [];
  const matches: ExplicitMentionResolution[] = [];

  candidates.forEach((candidate) => {
    const normalizedMention = candidate.mention.toLowerCase();
    let searchStart = 0;

    while (searchStart < normalizedMessage.length) {
      const foundAt = normalizedMessage.indexOf(normalizedMention, searchStart);
      if (foundAt < 0) break;

      const end = foundAt + normalizedMention.length;
      const before = userMessage[foundAt - 1] ?? '';
      const after = userMessage[end] ?? '';
      const overlaps = occupiedRanges.some((range) => foundAt < range.end && end > range.start);

      if (
        !overlaps &&
        (foundAt === 0 || isExplicitMentionBoundaryStart(before)) &&
        isExplicitMentionBoundaryEnd(after)
      ) {
        occupiedRanges.push({ start: foundAt, end });
        matches.push({ ...candidate, start: foundAt, end });
      }

      searchStart = foundAt + 1;
    }
  });

  return matches.sort((left, right) => left.start - right.start);
}

function isExplicitMentionBoundaryStart(char: string): boolean {
  return /\s|[([{'"`]/.test(char);
}

function isExplicitMentionBoundaryEnd(char: string): boolean {
  return !char || /\s|[)\]}.,;:!?]/.test(char);
}

function buildParsingInputWithExplicitMentions(
  userMessage: string,
  mentions: ExplicitMentionResolution[],
): string {
  const preparedUserMessage = prepareUserMessageForParsing(userMessage);
  if (mentions.length === 0) return preparedUserMessage;

  const mentionLines = mentions.map((mention) => {
    const entityLabel =
      mention.entityType === 'account'
        ? 'account'
        : mention.entityType === 'expense_category'
          ? 'expense category'
          : 'income category';
    return `- ${mention.mention} => ${entityLabel} "${mention.name}"`;
  });

  return `${preparedUserMessage}

Resolved @mentions selected by the user:
${mentionLines.join('\n')}

Treat each resolved @mention above as an exact user selection.`;
}

function getDefaultAccountIcon(): string {
  return '🏦';
}

function resolveAcceptedTransactionNote(
  transaction: PreviewTransaction,
  categories: { id: string; name: string; parentId: string | null }[],
): string | null {
  const explicitNote = transaction.note?.trim();
  if (explicitNote) return explicitNote;
  if (transaction.type === 'transfer') return null;

  if (transaction.categoryId) {
    const category = categories.find((item) => item.id === transaction.categoryId) ?? null;
    const parent =
      category?.parentId != null
        ? (categories.find((item) => item.id === category.parentId) ?? null)
        : null;
    const categoryLabel = parent ? `${parent.name} / ${category?.name ?? ''}` : category?.name;
    const normalizedCategoryLabel = categoryLabel?.trim();
    if (normalizedCategoryLabel) return normalizedCategoryLabel;
  }

  const fallbackCategoryName = transaction.categoryName?.trim();
  return fallbackCategoryName ? fallbackCategoryName : null;
}

export interface PreviewTransaction {
  tempId: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  date: string;
  showDate: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  accountId: string | null;
  accountName: string | null;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  note: string | null;
  status: 'pending' | 'accepted' | 'rejected';
}

function canAcceptPreviewTransaction(
  transaction: PreviewTransaction,
  hideAccountSelector: boolean,
): boolean {
  if (transaction.type === 'transfer') {
    return Boolean(
      transaction.fromAccountId &&
      transaction.toAccountId &&
      transaction.fromAccountId !== transaction.toAccountId,
    );
  }

  return Boolean(transaction.categoryId && (hideAccountSelector || transaction.accountId));
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  transactions?: PreviewTransaction[];
}

interface EditingPreviewState {
  messageId: string;
  transaction: PreviewTransaction;
}

interface AIChatScreenProps {
  onBack: () => void;
}

export function AIChatScreen({ onBack }: AIChatScreenProps) {
  const {
    accounts,
    categories,
    settings,
    createTransaction,
    updateSettings,
    isSimpleMode,
    simpleWalletId,
  } = useApp();
  const themeColors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const keyboardPaddingStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value, safeBottom),
  }));
  const scrollRef = useRef<ScrollView>(null);
  const modelStatus = useSyncExternalStore(
    llamaService.subscribeToStatus,
    () => llamaService.getStatus().status,
  );
  const defaultModelDownloadProgress = useSyncExternalStore(
    modelDownloadService.subscribeToDownloadState,
    () => modelDownloadService.getModelDownloadProgress(AI_CHAT_DEFAULT_MODEL.id),
  );
  const activationError = useSyncExternalStore(
    aiActivationService.subscribeToActivationState,
    aiActivationService.getActivationError,
  );

  const [downloadedModels, setDownloadedModels] = useState<string[]>(() =>
    modelManager.getDownloadedModelFileNames(),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isContextBusy, setIsContextBusy] = useState(() => llamaService.isContextBusy());
  const [isActivatingAi, setIsActivatingAi] = useState(false);

  const loadRequestIdRef = useRef(0);
  const [stoppedManually, setStoppedManually] = useState(false);
  const stoppedManuallyRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const rejectCleanupTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingPreview, setEditingPreview] = useState<EditingPreviewState | null>(null);

  const defaultAiChatAccount = useMemo(
    () => accounts.find((account) => account.id === settings.aiChatDefaultAccountId) ?? null,
    [accounts, settings.aiChatDefaultAccountId],
  );
  const defaultAiChatIncomeCategory = useMemo(
    () =>
      categories.find(
        (category) =>
          category.id === settings.aiChatDefaultIncomeCategoryId && category.type === 'income',
      ) ?? null,
    [categories, settings.aiChatDefaultIncomeCategoryId],
  );
  const isDefaultModelDownloaded = downloadedModels.includes(AI_CHAT_DEFAULT_MODEL.fileName);
  const isDownloadingDefaultModel = defaultModelDownloadProgress !== null;
  const simpleWallet = useMemo(
    () => accounts.find((account) => account.id === simpleWalletId) ?? null,
    [accounts, simpleWalletId],
  );
  const placeholderPrimaryAccount = useMemo(() => {
    if (isSimpleMode) return simpleWallet ?? accounts[0] ?? null;
    return defaultAiChatAccount ?? accounts[0] ?? null;
  }, [accounts, defaultAiChatAccount, isSimpleMode, simpleWallet]);
  const placeholderTransferToAccount = useMemo(() => {
    if (isSimpleMode) return null;
    if (!placeholderPrimaryAccount) return accounts[1] ?? accounts[0] ?? null;
    return accounts.find((account) => account.id !== placeholderPrimaryAccount.id) ?? null;
  }, [accounts, isSimpleMode, placeholderPrimaryAccount]);
  const mentionOptions = useMemo<ChatInputMentionOption[]>(() => {
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    return [
      ...accounts.map((account) => ({
        id: `account:${account.id}`,
        type: 'account' as const,
        label: account.name,
        icon: getDefaultAccountIcon(),
      })),
      ...categories.map((category) => {
        const parentCategory = category.parentId ? categoriesById.get(category.parentId) : null;
        return {
          id: `category:${category.id}`,
          type: 'category' as const,
          label: category.name,
          icon: resolveCategoryIcon(category.icon, parentCategory?.icon ?? null),
        };
      }),
    ];
  }, [accounts, categories]);
  const defaultAccountSelectOptions = useMemo(
    () => [
      {
        value: NO_DEFAULT_ACCOUNT_OPTION_VALUE,
        label: I18n.t('aiChat.no_default_account'),
      },
      ...accounts.map((account) => ({
        value: account.id,
        label: account.name,
        description: account.currency,
        icon: getDefaultAccountIcon(),
      })),
    ],
    [accounts],
  );
  const defaultIncomeCategorySelectOptions = useMemo(() => {
    const categoriesById = new Map(categories.map((category) => [category.id, category]));

    return [
      {
        value: NO_DEFAULT_INCOME_CATEGORY_OPTION_VALUE,
        label: I18n.t('aiChat.no_default_income_category'),
      },
      ...categories
        .filter((category) => category.type === 'income')
        .map((category) => {
          const parentCategory = category.parentId ? categoriesById.get(category.parentId) : null;
          return {
            value: category.id,
            label: category.name,
            description: parentCategory?.name,
            icon: resolveCategoryIcon(category.icon, parentCategory?.icon ?? null),
          };
        }),
    ];
  }, [categories]);

  const refreshDownloadedModels = useCallback(() => {
    setDownloadedModels(modelManager.getDownloadedModelFileNames());
  }, []);

  const closeEditingPreview = useCallback(() => {
    setEditingPreview(null);
  }, []);

  const recoverFromDefaultModelFailure = useCallback(
    async (message: string) => {
      loadRequestIdRef.current += 1;

      try {
        await llamaService.releaseModel();
      } catch {
        // ignore release errors during recovery
      }

      if (modelManager.isModelDownloaded(AI_CHAT_DEFAULT_MODEL.fileName)) {
        modelManager.deleteModel(AI_CHAT_DEFAULT_MODEL.fileName);
      }

      refreshDownloadedModels();
      aiActivationService.setActivationError(message);
    },
    [refreshDownloadedModels],
  );

  const loadModel = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    try {
      await llamaService.loadModel(modelManager.getModelPath(AI_CHAT_DEFAULT_MODEL.fileName));
      if (loadRequestIdRef.current !== requestId) return;

      const today = dayKeyFromDateLocal(new Date());
      const systemPrompt = buildSystemPrompt(
        accounts,
        categories,
        settings.currencyCode,
        settings.currencySymbol,
        today,
        !isSimpleMode,
      );
      void llamaService.primeTransactionParser(systemPrompt).catch(() => {});
    } catch {
      if (loadRequestIdRef.current !== requestId) return;
      throw new Error(I18n.t('aiChat.prepare_failed'));
    }
  }, [accounts, categories, settings.currencyCode, settings.currencySymbol, isSimpleMode]);

  useEffect(() => {
    let isMounted = true;

    const initializeModel = async () => {
      const files = modelManager.getDownloadedModelFileNames();
      if (!isMounted) return;

      setDownloadedModels(files);
      const hasDefaultModel = files.includes(AI_CHAT_DEFAULT_MODEL.fileName);

      if (!settings.aiChatEnabled || !hasDefaultModel) {
        return;
      }

      try {
        aiActivationService.setActivationError(null);
        await loadModel();
      } catch (error) {
        if (!isMounted) return;
        const detail = error instanceof Error ? error.message : I18n.t('aiChat.prepare_failed');
        await recoverFromDefaultModelFailure(detail);
      }
    };

    void initializeModel();

    return () => {
      isMounted = false;
      loadRequestIdRef.current += 1;
    };
  }, [loadModel, recoverFromDefaultModelFailure, settings.aiChatEnabled]);

  useEffect(() => {
    return () => {
      rejectCleanupTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      rejectCleanupTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => llamaService.subscribeToBusyState(setIsContextBusy), []);

  const handleEnableAiFeature = useCallback(async () => {
    if (isDownloadingDefaultModel || isActivatingAi || modelStatus === 'loading') return;

    aiActivationService.setActivationError(null);
    setIsActivatingAi(true);

    try {
      await modelDownloadService.ensureModelDownloaded(AI_CHAT_DEFAULT_MODEL);
      refreshDownloadedModels();

      await loadModel();
      aiActivationService.setActivationError(null);
      updateSettings({ aiChatEnabled: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : I18n.t('aiChat.error');
      await recoverFromDefaultModelFailure(detail);
    } finally {
      setIsActivatingAi(false);
    }
  }, [
    isActivatingAi,
    isDownloadingDefaultModel,
    loadModel,
    modelStatus,
    refreshDownloadedModels,
    recoverFromDefaultModelFailure,
    updateSettings,
  ]);

  const handleDisableAiFeature = useCallback(async () => {
    void triggerHaptic('warning');
    aiActivationService.setActivationError(null);
    setShowSettingsModal(false);
    setMessages([]);
    setIsGenerating(false);
    setIsContextBusy(false);
    setIsActivatingAi(false);
    loadRequestIdRef.current += 1;
    sendInFlightRef.current = false;
    await llamaService.releaseModel();
    modelManager.deleteAllModels();
    refreshDownloadedModels();
    updateSettings({ aiChatEnabled: false });
  }, [refreshDownloadedModels, updateSettings]);

  const handleSend = useCallback(
    (text: string): boolean => {
      const shouldBlockSend =
        modelStatus !== 'ready' ||
        isGenerating ||
        sendInFlightRef.current ||
        llamaService.isContextBusy();
      if (shouldBlockSend) {
        setIsContextBusy(llamaService.isContextBusy());
        return false;
      }

      sendInFlightRef.current = true;
      stoppedManuallyRef.current = false;
      setStoppedManually(false);

      const userMsg: ChatMessage = { id: newId(), role: 'user', content: text };
      setMessages([userMsg]);
      const explicitMentions = resolveExplicitMentions(text, accounts, categories);

      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

      if (!looksLikeTransactionMessage(text)) {
        const assistantMsg: ChatMessage = {
          id: newId(),
          role: 'assistant',
          content: I18n.t('aiChat.no_transactions'),
          transactions: [],
        };

        setMessages((prev) => [...prev, assistantMsg]);
        sendInFlightRef.current = false;
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        return true;
      }

      setIsGenerating(true);

      void (async () => {
        try {
          const today = dayKeyFromDateLocal(new Date());
          const hasExplicitDate = hasExplicitDateReference(text);
          const systemPrompt = buildSystemPrompt(
            accounts,
            categories,
            settings.currencyCode,
            settings.currencySymbol,
            today,
            !isSimpleMode,
          );
          const parsingInput = buildParsingInputWithExplicitMentions(text, explicitMentions);

          const responseText = await llamaService.generateTransactions(parsingInput, systemPrompt);

          if (stoppedManuallyRef.current) return;

          let parsed: LLMTransactionOutput[] = [];
          try {
            const jsonResult = JSON.parse(responseText);
            if (Array.isArray(jsonResult)) {
              parsed = jsonResult;
            } else if (jsonResult.transactions && Array.isArray(jsonResult.transactions)) {
              parsed = jsonResult.transactions;
            }
          } catch {
            parsed = [];
          }

          parsed = alignParsedTransactionAmounts(parsed, text);
          if (isSimpleMode) {
            parsed = parsed.filter((transaction) => transaction.type !== 'transfer');
          }

          const explicitAccountMentions = explicitMentions.filter(
            (mention) => mention.entityType === 'account',
          );
          const explicitExpenseCategoryMentions = explicitMentions.filter(
            (mention) => mention.entityType === 'expense_category',
          );
          const explicitIncomeCategoryMentions = explicitMentions.filter(
            (mention) => mention.entityType === 'income_category',
          );

          const previews: PreviewTransaction[] = parsed
            .filter((t) => t.amount > 0 && ['expense', 'income', 'transfer'].includes(t.type))
            .map((t) => {
              const catType = t.type === 'transfer' ? 'expense' : t.type;
              const explicitCategoryMentions =
                catType === 'expense'
                  ? explicitExpenseCategoryMentions
                  : explicitIncomeCategoryMentions;
              const explicitCategoryMention =
                t.type !== 'transfer' &&
                parsed.length === 1 &&
                explicitCategoryMentions.length === 1
                  ? (explicitCategoryMentions[0] ?? null)
                  : null;
              const explicitSharedAccountId =
                t.type !== 'transfer' && explicitAccountMentions.length === 1
                  ? (explicitAccountMentions[0]?.id ?? null)
                  : null;
              const transferMentionAccounts =
                t.type === 'transfer' && parsed.length === 1
                  ? explicitAccountMentions.slice(0, 2)
                  : [];
              const categoryId =
                (t.type !== 'transfer' ? (explicitCategoryMention?.id ?? null) : null) ??
                resolveCategoryByName(t.categoryName, categories, catType) ??
                (t.type === 'income' ? (defaultAiChatIncomeCategory?.id ?? null) : null);
              const accountId =
                explicitSharedAccountId ??
                resolveNameToId(
                  t.accountName,
                  accounts.map((a) => ({ id: a.id, name: a.name })),
                );
              const fromAccountId =
                transferMentionAccounts[0]?.id ??
                resolveNameToId(
                  t.fromAccountName,
                  accounts.map((a) => ({ id: a.id, name: a.name })),
                );
              const toAccountId =
                transferMentionAccounts[1]?.id ??
                resolveNameToId(
                  t.toAccountName,
                  accounts.map((a) => ({ id: a.id, name: a.name })),
                );
              const didUserSpecifyAccount = Boolean(
                t.accountName?.trim() ||
                explicitSharedAccountId ||
                transferMentionAccounts.length > 0,
              );
              const resolvedAccountId =
                isSimpleMode && simpleWalletId && t.type !== 'transfer'
                  ? simpleWalletId
                  : !didUserSpecifyAccount && t.type !== 'transfer'
                    ? (defaultAiChatAccount?.id ?? null)
                    : accountId;

              const resolvedCategory = categoryId
                ? categories.find((c) => c.id === categoryId)
                : null;
              const resolvedParentCategory =
                resolvedCategory?.parentId != null
                  ? categories.find((c) => c.id === resolvedCategory.parentId)
                  : null;
              const resolvedAccount = resolvedAccountId
                ? accounts.find((a) => a.id === resolvedAccountId)
                : null;
              const resolvedFrom = fromAccountId
                ? accounts.find((a) => a.id === fromAccountId)
                : null;
              const resolvedTo = toAccountId ? accounts.find((a) => a.id === toAccountId) : null;
              const resolvedDate = normalizeTransactionDate(t.date, today);

              return {
                tempId: newId(),
                type: t.type,
                amount: t.amount,
                currency: settings.currencySymbol,
                date: resolvedDate,
                showDate: hasExplicitDate || resolvedDate !== today,
                categoryId,
                categoryName: resolvedCategory?.name ?? null,
                categoryIcon: resolvedCategory
                  ? resolveCategoryIcon(resolvedCategory.icon, resolvedParentCategory?.icon ?? null)
                  : null,
                accountId: resolvedAccountId,
                accountName: resolvedAccount?.name ?? t.accountName ?? null,
                fromAccountId,
                fromAccountName: resolvedFrom?.name ?? t.fromAccountName ?? null,
                toAccountId,
                toAccountName: resolvedTo?.name ?? t.toAccountName ?? null,
                note: normalizeTransactionNote(t.note, text, t.amount, t.type),
                status: 'pending' as const,
              };
            });

          const assistantMsg: ChatMessage = {
            id: newId(),
            role: 'assistant',
            content: previews.length > 0 ? '' : I18n.t('aiChat.no_transactions'),
            transactions: previews,
          };

          setMessages((prev) => [...prev, assistantMsg]);
        } catch (e) {
          if (stoppedManuallyRef.current || llamaService.isGenerationStoppedError(e)) {
            return;
          }

          if (llamaService.isContextBusyError(e)) {
            setIsContextBusy(true);
            return;
          }

          const detail = e instanceof Error ? e.message : String(e);
          console.warn('[AIChatScreen] generation error:', detail);
          const errorMsg: ChatMessage = {
            id: newId(),
            role: 'assistant',
            content: `${I18n.t('aiChat.error')}\n\n${detail}`,
          };
          setMessages((prev) => [...prev, errorMsg]);
        } finally {
          setIsGenerating(false);
          sendInFlightRef.current = false;
          setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        }
      })();

      return true;
    },
    [
      accounts,
      categories,
      defaultAiChatAccount,
      defaultAiChatIncomeCategory,
      isGenerating,
      isSimpleMode,
      modelStatus,
      settings.currencyCode,
      settings.currencySymbol,
      simpleWalletId,
    ],
  );

  const handleStopGeneration = useCallback(() => {
    stoppedManuallyRef.current = true;
    setStoppedManually(true);
    llamaService.stopGeneration();
    setIsGenerating(false);
    setIsContextBusy(false);
    sendInFlightRef.current = false;
  }, []);

  const handleAcceptTransaction = useCallback(
    (messageId: string, tempId: string) => {
      const transactionToAccept =
        messages
          .find((msg) => msg.id === messageId)
          ?.transactions?.find((t) => t.tempId === tempId) ?? null;
      if (!transactionToAccept || transactionToAccept.status !== 'pending') return;
      if (!canAcceptPreviewTransaction(transactionToAccept, isSimpleMode)) return;

      const resolvedNote = resolveAcceptedTransactionNote(transactionToAccept, categories);

      createTransaction({
        type: transactionToAccept.type,
        amount: transactionToAccept.amount,
        currency: settings.currencyCode,
        date: transactionToAccept.date,
        accountId:
          transactionToAccept.type !== 'transfer' ? transactionToAccept.accountId : undefined,
        fromAccountId:
          transactionToAccept.type === 'transfer' ? transactionToAccept.fromAccountId : undefined,
        toAccountId:
          transactionToAccept.type === 'transfer' ? transactionToAccept.toAccountId : undefined,
        categoryId: transactionToAccept.categoryId,
        note: resolvedNote,
        sentiment: 'neutral',
      });

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          return {
            ...msg,
            transactions: msg.transactions?.map((t) => {
              if (t.tempId !== tempId) return t;
              return { ...t, note: resolvedNote, status: 'accepted' as const };
            }),
          };
        }),
      );
    },
    [categories, createTransaction, isSimpleMode, messages, settings.currencyCode],
  );

  const handleRejectTransaction = useCallback((messageId: string, tempId: string) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          transactions: msg.transactions?.filter((t) => t.tempId !== tempId) ?? [],
        };
      }),
    );

    const cleanupTimeoutId = setTimeout(() => {
      rejectCleanupTimeoutsRef.current = rejectCleanupTimeoutsRef.current.filter(
        (timeoutId) => timeoutId !== cleanupTimeoutId,
      );
      setMessages((prev) =>
        prev.filter((msg) => Boolean(msg.content) || (msg.transactions?.length ?? 0) > 0),
      );
    }, PREVIEW_REJECT_EXIT_DURATION_MS);

    rejectCleanupTimeoutsRef.current.push(cleanupTimeoutId);
  }, []);

  const handleEditTransaction = useCallback(
    (messageId: string, transaction: PreviewTransaction) => {
      setEditingPreview({ messageId, transaction });
    },
    [],
  );

  const handleSaveEditedPreview = useCallback(
    (input: CreateTransactionInput) => {
      if (!editingPreview) return;

      const originalTransaction = editingPreview.transaction;
      const previewType: PreviewTransaction['type'] =
        input.type === 'expense' || input.type === 'income' || input.type === 'transfer'
          ? input.type
          : originalTransaction.type;
      const resolvedCategory =
        input.categoryId != null
          ? (categories.find((category) => category.id === input.categoryId) ?? null)
          : null;
      const resolvedParentCategory =
        resolvedCategory?.parentId != null
          ? (categories.find((category) => category.id === resolvedCategory.parentId) ?? null)
          : null;
      const resolvedAccount =
        input.accountId != null
          ? (accounts.find((account) => account.id === input.accountId) ?? null)
          : null;
      const resolvedFromAccount =
        input.fromAccountId != null
          ? (accounts.find((account) => account.id === input.fromAccountId) ?? null)
          : null;
      const resolvedToAccount =
        input.toAccountId != null
          ? (accounts.find((account) => account.id === input.toAccountId) ?? null)
          : null;
      const normalizedNote = input.note?.trim() ? input.note.trim() : null;
      const today = dayKeyFromDateLocal(new Date());
      const resolvedDate = dayKeyFromIsoLocal(input.date);
      const nextTransaction: PreviewTransaction = {
        tempId: originalTransaction.tempId,
        type: previewType,
        amount: input.amount,
        currency: settings.currencySymbol,
        date: resolvedDate,
        showDate: originalTransaction.showDate || resolvedDate !== today,
        categoryId: resolvedCategory?.id ?? null,
        categoryName: resolvedCategory?.name ?? null,
        categoryIcon: resolvedCategory
          ? resolveCategoryIcon(resolvedCategory.icon, resolvedParentCategory?.icon ?? null)
          : null,
        accountId: resolvedAccount?.id ?? null,
        accountName: resolvedAccount?.name ?? null,
        fromAccountId: resolvedFromAccount?.id ?? null,
        fromAccountName: resolvedFromAccount?.name ?? null,
        toAccountId: resolvedToAccount?.id ?? null,
        toAccountName: resolvedToAccount?.name ?? null,
        note: normalizedNote,
        status: 'pending',
      };

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== editingPreview.messageId) return msg;
          return {
            ...msg,
            transactions: msg.transactions?.map((transaction) =>
              transaction.tempId === originalTransaction.tempId ? nextTransaction : transaction,
            ),
          };
        }),
      );
    },
    [accounts, categories, editingPreview, settings.currencySymbol],
  );

  const isModelReady = modelStatus === 'ready';
  const isAiGateVisible =
    !settings.aiChatEnabled ||
    !isDefaultModelDownloaded ||
    isActivatingAi ||
    isDownloadingDefaultModel;
  const isBusyScreenVisible = isModelReady && isContextBusy && !isGenerating && !stoppedManually;
  const isChatInputDisabled = !isModelReady;
  const isChatSendDisabled = isChatInputDisabled || isGenerating || isContextBusy;
  const gateProgressPercent =
    defaultModelDownloadProgress != null ? Math.round(defaultModelDownloadProgress * 100) : null;
  const chatInputPlaceholder = useMemo(() => {
    const primaryAccountName = placeholderPrimaryAccount?.name ?? null;
    const secondaryAccountName = placeholderTransferToAccount?.name ?? null;
    const candidates: string[] = [];

    if (primaryAccountName) {
      const accountMention = `@${primaryAccountName}`;
      candidates.push(
        I18n.t('aiChat.placeholder_expense_with_account', { account: accountMention }),
      );
      candidates.push(
        I18n.t('aiChat.placeholder_income_with_account', { account: accountMention }),
      );
    } else {
      candidates.push(I18n.t('aiChat.placeholder'));
    }

    if (!isSimpleMode && primaryAccountName && secondaryAccountName) {
      candidates.push(
        I18n.t('aiChat.placeholder_transfer_with_accounts', {
          fromAccount: `@${primaryAccountName}`,
          toAccount: `@${secondaryAccountName}`,
        }),
      );
    }

    return (
      candidates[Math.floor(Math.random() * candidates.length)] ?? I18n.t('aiChat.placeholder')
    );
  }, [isSimpleMode, placeholderPrimaryAccount, placeholderTransferToAccount]);

  return (
    <SettingsPageLayout edges={['top']}>
      <SettingsHeader
        title={I18n.t('aiChat.title')}
        onBack={onBack}
        closeRowAccessory={
          settings.aiChatEnabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={I18n.t('aiChat.open_settings')}
              onPress={() => {
                void triggerHaptic('selection');
                setShowSettingsModal(true);
              }}
              className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card shadow-soft"
            >
              <Settings size={18} color={themeColors.textMuted} />
            </Pressable>
          ) : null
        }
      />

      {isAiGateVisible ? (
        <View className="flex-1 px-5">
          <View className="flex-1 items-center" style={styles.gateContent}>
            <View className="relative w-full overflow-hidden rounded-[30px] border border-border/30 bg-card px-5 py-6 shadow-soft">
              <View
                className="absolute -right-10 -top-10 h-28 w-28 rounded-full"
                style={{ backgroundColor: `${themeColors.primary}12` }}
              />
              <View
                className="absolute -left-6 bottom-10 h-20 w-20 rounded-full"
                style={{ backgroundColor: `${themeColors.primary}0A` }}
              />

              <View className="items-center">
                <View
                  className="h-14 w-14 items-center justify-center rounded-full border"
                  style={{
                    borderColor: `${themeColors.primary}30`,
                    backgroundColor: `${themeColors.primary}12`,
                  }}
                >
                  <Shield size={24} color={themeColors.primary} />
                </View>

                <View className="mt-4 flex-row flex-wrap justify-center gap-2">
                  <View className="rounded-full border border-border/40 bg-background/60 px-3 py-1">
                    <Text variant="caption" tone="muted" className="text-[11px]">
                      {I18n.t('aiChat.enable_chip_private')}
                    </Text>
                  </View>
                  <View className="rounded-full border border-border/40 bg-background/60 px-3 py-1">
                    <Text variant="caption" tone="muted" className="text-[11px]">
                      {I18n.t('aiChat.enable_chip_local')}
                    </Text>
                  </View>
                  <View className="rounded-full border border-border/40 bg-background/60 px-3 py-1">
                    <Text variant="caption" tone="muted" className="text-[11px]">
                      {AI_CHAT_DEFAULT_MODEL.sizeLabel}
                    </Text>
                  </View>
                </View>

                <Text variant="heading" className="mt-5 text-center tracking-tight">
                  {I18n.t('aiChat.enable_title')}
                </Text>
                <Text variant="body" tone="muted" className="mt-2 text-center">
                  {I18n.t('aiChat.enable_description_intro')}{' '}
                  {I18n.t('aiChat.enable_description_download_prefix')}{' '}
                  <Text variant="bodyStrong" tone="muted">
                    {I18n.t('aiChat.enable_description_once')}
                  </Text>{' '}
                  {I18n.t('aiChat.enable_description_download_suffix')}
                </Text>

                {isDownloadingDefaultModel ? (
                  <View className="mt-5 w-full">
                    <View className="h-2 overflow-hidden rounded-full bg-border/40">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${gateProgressPercent ?? 0}%`,
                          backgroundColor: themeColors.primary,
                        }}
                      />
                    </View>
                    <Text variant="caption" tone="muted" className="mt-2 text-center">
                      {I18n.t('aiChat.downloading_local_ai_progress', {
                        progress: gateProgressPercent ?? 0,
                      })}
                    </Text>
                  </View>
                ) : null}

                {activationError ? (
                  <Text variant="caption" tone="error" className="mt-4 text-center">
                    {activationError}
                  </Text>
                ) : null}

                <Button
                  className="mt-6 w-full"
                  onPress={() => {
                    void handleEnableAiFeature();
                  }}
                  disabled={
                    isDownloadingDefaultModel || isActivatingAi || modelStatus === 'loading'
                  }
                >
                  <View className="flex-row items-center gap-2">
                    {isDownloadingDefaultModel || isActivatingAi || modelStatus === 'loading' ? (
                      <ActivityIndicator size="small" color={GATE_BUTTON_CONTENT_COLOR} />
                    ) : (
                      <Download size={16} color={GATE_BUTTON_CONTENT_COLOR} />
                    )}
                    <Text variant="bodyStrong" style={{ color: GATE_BUTTON_CONTENT_COLOR }}>
                      {isDownloadingDefaultModel
                        ? I18n.t('aiChat.downloading_local_ai')
                        : isActivatingAi || modelStatus === 'loading'
                          ? I18n.t('aiChat.preparing_local_ai')
                          : isDefaultModelDownloaded
                            ? I18n.t('aiChat.enable_local_ai')
                            : I18n.t('aiChat.download_local_ai')}
                    </Text>
                  </View>
                </Button>

                <Text variant="caption" tone="muted" className="mt-3 text-center">
                  {I18n.t('aiChat.enable_stay_on_screen')}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : (
        <Animated.View style={[styles.chatContent, keyboardPaddingStyle]}>
          {isBusyScreenVisible ? (
            <View className="flex-1 px-5">
              <View className="flex-1 items-center justify-center" style={styles.busyContent}>
                <View className="relative w-full overflow-hidden rounded-[30px] border border-border/30 bg-card px-5 py-6 shadow-soft">
                  <View
                    className="absolute -right-10 -top-10 h-28 w-28 rounded-full"
                    style={{ backgroundColor: `${themeColors.primary}12` }}
                  />
                  <View
                    className="absolute -left-6 bottom-10 h-20 w-20 rounded-full"
                    style={{ backgroundColor: `${themeColors.primary}0A` }}
                  />

                  <View className="items-center">
                    <View
                      className="h-16 w-16 items-center justify-center rounded-full border"
                      style={{
                        borderColor: `${themeColors.primary}30`,
                        backgroundColor: `${themeColors.primary}12`,
                      }}
                    >
                      <ActivityIndicator size="large" color={themeColors.primary} />
                    </View>

                    <Text variant="heading" className="mt-5 text-center tracking-tight">
                      {I18n.t('aiChat.busy_title')}
                    </Text>
                    <Text variant="body" tone="muted" className="mt-2 text-center">
                      {I18n.t('aiChat.busy_description')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerStyle={styles.messagesContent}
              keyboardDismissMode="interactive"
            >
              {messages.map((msg) => {
                const hasTransactions = Boolean(msg.transactions && msg.transactions.length > 0);

                return (
                  <View
                    key={msg.id}
                    className={`mb-3 ${
                      msg.role === 'user'
                        ? 'max-w-[85%] self-end'
                        : hasTransactions
                          ? 'w-full self-stretch'
                          : 'self-start'
                    }`}
                  >
                    {msg.content ? (
                      <View
                        className="rounded-2xl px-4 py-3"
                        style={{
                          backgroundColor:
                            msg.role === 'user' ? themeColors.primary : themeColors.surface,
                        }}
                      >
                        <Text
                          variant="body"
                          className="text-base"
                          style={{
                            color: msg.role === 'user' ? '#fff' : themeColors.text,
                          }}
                        >
                          {msg.content}
                        </Text>
                      </View>
                    ) : null}

                    {hasTransactions ? (
                      <View className={`w-full gap-2 ${msg.content ? 'mt-2' : ''}`}>
                        {msg.transactions?.map((t) => (
                          <TransactionPreviewCard
                            key={t.tempId}
                            transaction={t}
                            acceptDisabled={!canAcceptPreviewTransaction(t, isSimpleMode)}
                            onAccept={() => handleAcceptTransaction(msg.id, t.tempId)}
                            onReject={() => handleRejectTransaction(msg.id, t.tempId)}
                            onEdit={() => handleEditTransaction(msg.id, t)}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {isGenerating ? (
                <View className="mb-3 self-start">
                  <View
                    className="rounded-2xl px-4 py-3"
                    style={{ backgroundColor: themeColors.surface }}
                  >
                    <ActivityIndicator size="small" color={themeColors.primary} />
                  </View>
                </View>
              ) : null}
            </ScrollView>
          )}

          <ChatInput
            autoFocus={isModelReady && !isContextBusy}
            inputDisabled={isChatInputDisabled}
            sendDisabled={isChatSendDisabled}
            isGenerating={isGenerating}
            onSend={handleSend}
            onStop={handleStopGeneration}
            placeholder={
              !isModelReady
                ? I18n.t('aiChat.model_loading')
                : chatInputPlaceholder
            }
            mentionOptions={mentionOptions}
          />
        </Animated.View>
      )}

      <Modal
        visible={showSettingsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <SettingsPageLayout edges={['top', 'bottom']}>
          <View style={styles.headerWrap}>
            <SettingsHeader
              className="px-0 pt-5 pb-3"
              title={I18n.t('aiChat.settings_title')}
              onClose={() => setShowSettingsModal(false)}
            />
          </View>

          <ScrollView className="flex-1" contentContainerStyle={styles.settingsContent}>
            <Card>
              <CardContent className="py-5 gap-4">
                {isSimpleMode ? (
                  <View className="gap-2">
                    <Text variant="label" tone="muted">
                      {I18n.t('aiChat.account_section_title')}
                    </Text>
                    <View className="rounded-[22px] border border-border/40 bg-card px-4 py-4">
                      <Text variant="bodyStrong">
                        {simpleWallet?.name ?? I18n.t('aiChat.no_default_account')}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <SelectField
                    label={I18n.t('aiChat.account_section_title')}
                    sheetTitle={I18n.t('aiChat.account_section_title')}
                    value={defaultAiChatAccount?.id ?? NO_DEFAULT_ACCOUNT_OPTION_VALUE}
                    options={defaultAccountSelectOptions}
                    optionsLayout="list"
                    placeholder={I18n.t('aiChat.no_default_account')}
                    onChange={(value) => {
                      updateSettings({
                        aiChatDefaultAccountId:
                          value === NO_DEFAULT_ACCOUNT_OPTION_VALUE ? null : value,
                      });
                    }}
                  />
                )}

                <SelectField
                  label={I18n.t('aiChat.income_category_section_title')}
                  sheetTitle={I18n.t('aiChat.income_category_section_title')}
                  value={defaultAiChatIncomeCategory?.id ?? NO_DEFAULT_INCOME_CATEGORY_OPTION_VALUE}
                  options={defaultIncomeCategorySelectOptions}
                  optionsLayout="list"
                  placeholder={I18n.t('aiChat.no_default_income_category')}
                  onChange={(value) => {
                    updateSettings({
                      aiChatDefaultIncomeCategoryId:
                        value === NO_DEFAULT_INCOME_CATEGORY_OPTION_VALUE ? null : value,
                    });
                  }}
                />
              </CardContent>
            </Card>

            <Card variant="outline" className="mt-5">
              <CardContent className="py-5 gap-4">
                <View style={styles.disableRow}>
                  <View
                    style={[
                      styles.disableIcon,
                      {
                        backgroundColor: `${themeColors.error}14`,
                      },
                    ]}
                  >
                    <Trash2 size={18} color={themeColors.error} />
                  </View>
                  <View style={styles.disableTextWrap}>
                    <Text variant="caption" tone="muted">
                      {I18n.t('aiChat.disable_section_subtitle')}
                    </Text>
                  </View>
                </View>

                <Button
                  variant="outline"
                  className="border-destructive/30 bg-destructive/5"
                  onPress={() => {
                    void handleDisableAiFeature();
                  }}
                >
                  <Text variant="bodyStrong" className="text-destructive">
                    {I18n.t('aiChat.disable_button')}
                  </Text>
                </Button>
              </CardContent>
            </Card>
          </ScrollView>
        </SettingsPageLayout>
      </Modal>

      <Modal
        visible={editingPreview !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeEditingPreview}
      >
        {editingPreview ? (
          <TransactionEditorScreen
            mode="create"
            onClose={closeEditingPreview}
            onSubmit={() => {}}
            onSubmitReady={handleSaveEditedPreview}
            titleOverride={I18n.t('transactions.editor.title_edit')}
            submitLabelOverride={I18n.t('common.save')}
            restrictTypeOptions={
              isSimpleMode ? ['expense', 'income'] : ['expense', 'income', 'transfer']
            }
            hideAccountSelector={isSimpleMode}
            initialAccountId={simpleWalletId ?? undefined}
            initialValues={{
              type: editingPreview.transaction.type,
              amount: editingPreview.transaction.amount.toString(),
              date: editingPreview.transaction.date,
              accountId: editingPreview.transaction.accountId,
              fromAccountId: editingPreview.transaction.fromAccountId,
              toAccountId: editingPreview.transaction.toAccountId,
              categoryId: editingPreview.transaction.categoryId,
              note: editingPreview.transaction.note ?? '',
              sentiment: 'neutral',
            }}
          />
        ) : null}
      </Modal>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  chatContent: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    flexGrow: 1,
  },
  gateContent: {
    paddingTop: 32,
  },
  busyContent: {
    paddingBottom: 24,
  },
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  settingsContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  disableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  disableIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disableTextWrap: {
    flex: 1,
  },
});
