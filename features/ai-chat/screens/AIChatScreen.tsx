import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  HardDrive,
  Landmark,
  MessageSquareText,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react-native';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { TransactionEditorScreen } from '~/features/transactions/components';
import {
  AccountPanel,
  CategoryPanel,
} from '~/features/transactions/components/editor';
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
import { TypingDots } from '../components/TypingDots';
import type { ModelDefinition } from '../constants/models';
import { AI_CHAT_DEFAULT_MODEL, AVAILABLE_MODELS, getModelById } from '../constants/models';
import { SMART_ENTRY_PLACEHOLDER_EXAMPLES } from '../constants/placeholders';
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

  const accountMentions = mentions.filter((m) => m.entityType === 'account');
  const categoryMentions = mentions.filter((m) => m.entityType !== 'account');

  const lines: string[] = [];
  if (accountMentions.length === 1) {
    lines.push(`"accountName": "${accountMentions[0]!.name}"`);
  } else if (accountMentions.length === 2) {
    lines.push(`"fromAccountName": "${accountMentions[0]!.name}"`);
    lines.push(`"toAccountName": "${accountMentions[1]!.name}"`);
  }
  if (categoryMentions.length === 1) {
    lines.push(`"categoryName": "${categoryMentions[0]!.name}"`);
  }

  if (lines.length === 0) return preparedUserMessage;

  return `${preparedUserMessage}

USE THESE VALUES in your JSON output:
${lines.join('\n')}`;
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
    accountGroups,
    categories,
    settings,
    createTransaction,
    updateSettings,
    isSimpleMode,
    simpleWalletId,
  } = useApp();
  const themeColors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const scrollRef = useRef<ScrollView>(null);
  const modelStatus = useSyncExternalStore(
    llamaService.subscribeToStatus,
    () => llamaService.getStatus().status,
  );
  const activeModel: ModelDefinition =
    (settings.aiChatModelId ? getModelById(settings.aiChatModelId) : undefined) ??
    AI_CHAT_DEFAULT_MODEL;
  const activeModelDownloadProgress = useSyncExternalStore(
    modelDownloadService.subscribeToDownloadState,
    () => modelDownloadService.getModelDownloadProgress(activeModel.id),
  );
  const activationError = useSyncExternalStore(
    aiActivationService.subscribeToActivationState,
    aiActivationService.getActivationError,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isContextBusy, setIsContextBusy] = useState(() => llamaService.isContextBusy());
  const [isActivatingAi, setIsActivatingAi] = useState(false);
  const [switchingModelId, setSwitchingModelId] = useState<string | null>(null);
  const switchingModelDownloadProgress = useSyncExternalStore(
    modelDownloadService.subscribeToDownloadState,
    () => (switchingModelId ? modelDownloadService.getModelDownloadProgress(switchingModelId) : null),
  );

  const loadRequestIdRef = useRef(0);
  const [stoppedManually, setStoppedManually] = useState(false);
  const stoppedManuallyRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const rejectCleanupTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingPreview, setEditingPreview] = useState<EditingPreviewState | null>(null);
  const [expandedSettingsSection, setExpandedSettingsSection] = useState<
    'account' | 'expense' | 'income' | null
  >(null);

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
  const defaultAiChatExpenseCategory = useMemo(
    () =>
      categories.find(
        (category) =>
          category.id === settings.aiChatDefaultExpenseCategoryId && category.type === 'expense',
      ) ?? null,
    [categories, settings.aiChatDefaultExpenseCategoryId],
  );
  const isActiveModelDownloaded = modelManager.isModelDownloaded(activeModel.fileName);
  const isDownloadingActiveModel = activeModelDownloadProgress !== null;
  const simpleWallet = useMemo(
    () => accounts.find((account) => account.id === simpleWalletId) ?? null,
    [accounts, simpleWalletId],
  );
  const placeholderPrimaryAccount = useMemo(() => {
    if (isSimpleMode) return simpleWallet ?? accounts[0] ?? null;
    return defaultAiChatAccount ?? accounts[0] ?? null;
  }, [accounts, defaultAiChatAccount, isSimpleMode, simpleWallet]);
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
  const buildCategoryPanelData = useCallback(
    (type: 'expense' | 'income') => {
      const parents: { id: string; name: string; icon: string }[] = [];
      const childByParent = new Map<string, { id: string; name: string; icon: string }[]>();
      const topLevelById = new Map<string, Category>();

      categories.forEach((category) => {
        if (category.type !== type) return;
        if (!category.parentId) {
          parents.push({
            id: category.id,
            name: category.name,
            icon: resolveCategoryIcon(category.icon),
          });
          topLevelById.set(category.id, category);
        }
      });

      categories.forEach((category) => {
        if (category.type !== type || !category.parentId) return;
        const parentNode = topLevelById.get(category.parentId);
        const children = childByParent.get(category.parentId) ?? [];
        children.push({
          id: category.id,
          name: category.name,
          icon: resolveCategoryIcon(category.icon, parentNode?.icon ?? null),
        });
        childByParent.set(category.parentId, children);
      });

      return { parents, childByParent };
    },
    [categories],
  );

  const expenseCategoryPanelData = useMemo(
    () => buildCategoryPanelData('expense'),
    [buildCategoryPanelData],
  );
  const incomeCategoryPanelData = useMemo(
    () => buildCategoryPanelData('income'),
    [buildCategoryPanelData],
  );

  const closeEditingPreview = useCallback(() => {
    setEditingPreview(null);
  }, []);

  const recoverFromModelFailure = useCallback(
    async (message: string, model: { fileName: string }) => {
      loadRequestIdRef.current += 1;

      try {
        await llamaService.releaseModel();
      } catch {
        // ignore release errors during recovery
      }

      if (modelManager.isModelDownloaded(model.fileName)) {
        modelManager.deleteModel(model.fileName);
      }

      aiActivationService.setActivationError(message);
    },
    [],
  );

  const loadModelForActiveModel = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    try {
      await llamaService.loadModel(modelManager.getModelPath(activeModel.fileName));
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
  }, [accounts, categories, settings.currencyCode, settings.currencySymbol, isSimpleMode, activeModel.fileName]);

  useEffect(() => {
    let isMounted = true;

    const initializeModel = async () => {
      if (!isMounted) return;

      const hasModel = modelManager.isModelDownloaded(activeModel.fileName);

      if (!settings.aiChatEnabled || !hasModel) {
        return;
      }

      try {
        aiActivationService.setActivationError(null);
        await loadModelForActiveModel();
      } catch (error) {
        if (!isMounted) return;
        const detail = error instanceof Error ? error.message : I18n.t('aiChat.prepare_failed');
        await recoverFromModelFailure(detail, activeModel);
      }
    };

    void initializeModel();

    return () => {
      isMounted = false;
      loadRequestIdRef.current += 1;
    };
  }, [loadModelForActiveModel, recoverFromModelFailure, settings.aiChatEnabled, activeModel]);

  useEffect(() => {
    return () => {
      rejectCleanupTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      rejectCleanupTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => llamaService.subscribeToBusyState(setIsContextBusy), []);

  const handleEnableAiFeature = useCallback(async () => {
    if (isDownloadingActiveModel || isActivatingAi || modelStatus === 'loading') return;

    aiActivationService.setActivationError(null);
    setIsActivatingAi(true);

    try {
      await modelDownloadService.ensureModelDownloaded(activeModel);

      await loadModelForActiveModel();
      aiActivationService.setActivationError(null);
      updateSettings({ aiChatEnabled: true });
    } catch (error) {
      const detail = error instanceof Error ? error.message : I18n.t('aiChat.error');
      await recoverFromModelFailure(detail, activeModel);
    } finally {
      setIsActivatingAi(false);
    }
  }, [
    activeModel,
    isActivatingAi,
    isDownloadingActiveModel,
    loadModelForActiveModel,
    modelStatus,
    recoverFromModelFailure,
    updateSettings,
  ]);

  const handleSwitchModel = useCallback(
    async (model: ModelDefinition) => {
      if (model.id === activeModel.id && modelStatus === 'ready') return;
      if (switchingModelId) return;

      void triggerHaptic('selection');
      setSwitchingModelId(model.id);
      setMessages([]);
      setIsGenerating(false);
      loadRequestIdRef.current += 1;
      sendInFlightRef.current = false;

      try {
        await llamaService.releaseModel();
      } catch {
        // ignore release errors
      }

      if (!modelManager.isModelDownloaded(model.fileName)) {
        try {
          await modelDownloadService.ensureModelDownloaded(model);
        } catch (error) {
          const detail = error instanceof Error ? error.message : I18n.t('aiChat.error');
          aiActivationService.setActivationError(detail);
          setSwitchingModelId(null);
          return;
        }
      }

      try {
        await llamaService.loadModel(modelManager.getModelPath(model.fileName));
        aiActivationService.setActivationError(null);
        updateSettings({ aiChatModelId: model.id });
      } catch (error) {
        const detail = error instanceof Error ? error.message : I18n.t('aiChat.prepare_failed');
        await recoverFromModelFailure(detail, model);
      } finally {
        setSwitchingModelId(null);
      }
    },
    [activeModel.id, modelStatus, switchingModelId, recoverFromModelFailure, updateSettings],
  );

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
    updateSettings({ aiChatEnabled: false });
  }, [updateSettings]);

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
            isSimpleMode ? simpleWallet?.name : defaultAiChatAccount?.name,
            defaultAiChatIncomeCategory?.name,
            defaultAiChatExpenseCategory?.name,
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
                (t.type === 'income' ? (defaultAiChatIncomeCategory?.id ?? null) : null) ??
                (t.type === 'expense' ? (defaultAiChatExpenseCategory?.id ?? null) : null);
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
      defaultAiChatExpenseCategory,
      defaultAiChatIncomeCategory,
      isGenerating,
      isSimpleMode,
      modelStatus,
      settings.currencyCode,
      settings.currencySymbol,
      simpleWallet?.name,
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
    !isActiveModelDownloaded ||
    isActivatingAi ||
    isDownloadingActiveModel;
  const isBusyScreenVisible = isModelReady && isContextBusy && !isGenerating && !stoppedManually;
  const isChatInputDisabled = !isModelReady;
  const isChatSendDisabled = isChatInputDisabled || isGenerating || isContextBusy;
  const gateProgressPercent =
    activeModelDownloadProgress != null ? Math.round(activeModelDownloadProgress * 100) : null;
  const chatInputPlaceholder = useMemo(() => {
    const examples = SMART_ENTRY_PLACEHOLDER_EXAMPLES;
    return `eg: ${examples[Math.floor(Math.random() * examples.length)]}`;
  }, []);

  const hasMessages = messages.length > 0;

  const [chipSeed, setChipSeed] = useState(0);
  useEffect(() => {
    if (messages.length === 0) setChipSeed((s) => s + 1);
  }, [messages.length]);

  const suggestionChips = useMemo(() => {
    const pool = SMART_ENTRY_PLACEHOLDER_EXAMPLES;
    const picked = new Set<number>();
    while (picked.size < 3 && picked.size < pool.length) {
      picked.add(Math.floor(Math.random() * pool.length));
    }
    const primaryName = placeholderPrimaryAccount?.name;
    return [...picked].map((index) => {
      const example = pool[index];
      const withAccount =
        primaryName && !example.includes('@') ? `${example} @${primaryName}` : example;
      return { label: example, value: withAccount };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholderPrimaryAccount, chipSeed]);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.chatContent}>
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
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{
                backgroundColor: `${themeColors.primary}10`,
                borderWidth: 1,
                borderColor: `${themeColors.primary}20`,
              }}
            >
              <Settings size={17} color={themeColors.primary} />
            </Pressable>
          ) : null
        }
      />

      {isAiGateVisible ? (
        <View className="flex-1 px-5">
          <View className="flex-1 items-center" style={styles.gateContent}>
            <Animated.View
              entering={FadeInUp.delay(100).springify().damping(16).stiffness(140)}
              className="relative w-full overflow-hidden rounded-[28px] border bg-card"
              style={{
                borderColor: `${themeColors.border}30`,
                shadowColor: themeColors.primary,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.08,
                shadowRadius: 32,
                elevation: 8,
              }}
            >
              {/* Decorative background orbs */}
              <View
                className="absolute -right-12 -top-12 h-36 w-36 rounded-full"
                style={{ backgroundColor: `${themeColors.primary}08` }}
              />
              <View
                className="absolute -left-8 bottom-8 h-24 w-24 rounded-full"
                style={{ backgroundColor: `${themeColors.accent}06` }}
              />

              <View className="items-center px-6 pb-7 pt-8">
                {/* Animated icon */}
                <GatePulseIcon color={themeColors.primary} />

                {/* Feature chips */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(300)}
                  className="mt-5 flex-row flex-wrap justify-center gap-2"
                >
                  <FeatureChip
                    icon={<Shield size={11} color={themeColors.primary} />}
                    label={I18n.t('aiChat.enable_chip_private')}
                    color={themeColors.primary}
                    bgColor={themeColors.background}
                    borderColor={themeColors.border}
                  />
                  <FeatureChip
                    icon={<Zap size={11} color={themeColors.primary} />}
                    label={I18n.t('aiChat.enable_chip_local')}
                    color={themeColors.primary}
                    bgColor={themeColors.background}
                    borderColor={themeColors.border}
                  />
                  <FeatureChip
                    icon={<HardDrive size={11} color={themeColors.textMuted} />}
                    label={activeModel.sizeLabel}
                    color={themeColors.textMuted}
                    bgColor={themeColors.background}
                    borderColor={themeColors.border}
                  />
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(300).duration(300)} className="mt-5">
                  <Text variant="heading" className="text-center text-xl tracking-tight">
                    {I18n.t('aiChat.enable_title')}
                  </Text>
                </Animated.View>
                <Animated.View entering={FadeInDown.delay(350).duration(300)} className="mt-2.5">
                  <Text variant="body" tone="muted" className="text-center leading-6">
                    {I18n.t('aiChat.enable_description_intro')}{' '}
                    {I18n.t('aiChat.enable_description_download_prefix')}{' '}
                    <Text variant="bodyStrong" tone="muted">
                      {I18n.t('aiChat.enable_description_once')}
                    </Text>{' '}
                    {I18n.t('aiChat.enable_description_download_suffix')}
                  </Text>
                </Animated.View>

                {isDownloadingActiveModel ? (
                  <Animated.View
                    entering={FadeIn.duration(200)}
                    className="mt-6 w-full"
                  >
                    <View
                      className="h-2.5 overflow-hidden rounded-full"
                      style={{ backgroundColor: `${themeColors.border}30` }}
                    >
                      <Animated.View
                        className="h-full rounded-full"
                        style={{
                          width: `${gateProgressPercent ?? 0}%`,
                          backgroundColor: themeColors.primary,
                        }}
                      />
                    </View>
                    <Text variant="caption" tone="muted" className="mt-2.5 text-center">
                      {I18n.t('aiChat.downloading_local_ai_progress', {
                        progress: gateProgressPercent ?? 0,
                      })}
                    </Text>
                  </Animated.View>
                ) : null}

                {activationError ? (
                  <Animated.View entering={FadeIn.duration(200)} className="mt-4">
                    <Text variant="caption" tone="error" className="text-center">
                      {activationError}
                    </Text>
                  </Animated.View>
                ) : null}

                <Animated.View
                  entering={FadeInDown.delay(450).duration(300)}
                  className="mt-6 w-full"
                >
                  <Button
                    onPress={() => {
                      void handleEnableAiFeature();
                    }}
                    disabled={
                      isDownloadingActiveModel || isActivatingAi || modelStatus === 'loading'
                    }
                  >
                    <View className="flex-row items-center gap-2.5">
                      {isDownloadingActiveModel || isActivatingAi || modelStatus === 'loading' ? (
                        <ActivityIndicator size="small" color={GATE_BUTTON_CONTENT_COLOR} />
                      ) : (
                        <Download size={16} color={GATE_BUTTON_CONTENT_COLOR} />
                      )}
                      <Text variant="bodyStrong" style={{ color: GATE_BUTTON_CONTENT_COLOR }}>
                        {isDownloadingActiveModel
                          ? I18n.t('aiChat.downloading_local_ai')
                          : isActivatingAi || modelStatus === 'loading'
                            ? I18n.t('aiChat.preparing_local_ai')
                            : isActiveModelDownloaded
                              ? I18n.t('aiChat.enable_local_ai')
                              : I18n.t('aiChat.download_local_ai')}
                      </Text>
                    </View>
                  </Button>
                </Animated.View>

                <Text variant="caption" tone="muted" className="mt-3 text-center">
                  {I18n.t('aiChat.enable_stay_on_screen')}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>
      ) : (
        <View style={styles.chatContent}>
          {isBusyScreenVisible ? (
            <View className="flex-1 items-center justify-center px-5">
              <Animated.View
                entering={FadeIn.springify().damping(14).stiffness(120)}
                className="w-full items-center rounded-[28px] border bg-card px-6 py-8"
                style={{
                  borderColor: `${themeColors.border}30`,
                  shadowColor: themeColors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.06,
                  shadowRadius: 20,
                  elevation: 6,
                }}
              >
                <View
                  className="h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${themeColors.primary}10` }}
                >
                  <TypingDots color={themeColors.primary} dotSize={8} gap={6} />
                </View>

                <Text variant="heading" className="mt-5 text-center tracking-tight">
                  {I18n.t('aiChat.busy_title')}
                </Text>
                <Text variant="body" tone="muted" className="mt-2 text-center leading-6">
                  {I18n.t('aiChat.busy_description')}
                </Text>
              </Animated.View>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              contentContainerStyle={[
                styles.messagesContent,
                !hasMessages && styles.emptyMessagesContent,
              ]}
              keyboardDismissMode="interactive"
            >
              {!hasMessages && !isGenerating ? (
                <Animated.View
                  entering={FadeIn.delay(200).duration(400)}
                  className="flex-1 items-center justify-center px-4"
                >
                  <View
                    className="h-16 w-16 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: `${themeColors.primary}0C` }}
                  >
                    <MessageSquareText size={28} color={`${themeColors.primary}60`} />
                  </View>
                  <Text
                    variant="body"
                    tone="muted"
                    className="mt-4 text-center text-base leading-6"
                  >
                    {I18n.t('aiChat.empty_state_title')}
                  </Text>
                  <Text
                    variant="caption"
                    tone="muted"
                    className="mt-1 text-center"
                  >
                    {I18n.t('aiChat.empty_state_subtitle')}
                  </Text>

                  {/* Quick suggestion chips */}
                  <View className="mt-6 flex-row flex-wrap justify-center gap-2">
                    {suggestionChips.map((chip) => (
                      <Pressable
                        key={chip.label}
                        onPress={() => {
                          void triggerHaptic('selection');
                          handleSend(chip.value);
                        }}
                        className="rounded-full px-4 py-2"
                        style={{
                          backgroundColor: `${themeColors.primary}08`,
                          borderWidth: 1,
                          borderColor: `${themeColors.primary}18`,
                        }}
                      >
                        <View className="flex-row items-center gap-1.5">
                          <Sparkles size={12} color={`${themeColors.primary}80`} />
                          <Text
                            variant="caption"
                            className="font-medium"
                            style={{ color: `${themeColors.primary}CC` }}
                          >
                            {chip.label}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </Animated.View>
              ) : null}

              {messages.map((msg, msgIndex) => {
                const hasTransactions = Boolean(msg.transactions && msg.transactions.length > 0);

                return (
                  <Animated.View
                    key={msg.id}
                    entering={FadeInUp.delay(msgIndex * 40)
                      .springify()
                      .damping(16)
                      .stiffness(160)}
                    className={`mb-3 ${
                      msg.role === 'user'
                        ? 'max-w-[85%] self-end'
                        : hasTransactions
                          ? 'w-full self-stretch'
                          : 'max-w-[90%] self-start'
                    }`}
                  >
                    {msg.content ? (
                      <View
                        className={`px-4 py-3 ${
                          msg.role === 'user'
                            ? 'rounded-2xl rounded-br-lg'
                            : 'rounded-2xl rounded-bl-lg'
                        }`}
                        style={{
                          backgroundColor:
                            msg.role === 'user' ? themeColors.primary : themeColors.surface,
                          ...(msg.role !== 'user'
                            ? {
                                borderWidth: 1,
                                borderColor: `${themeColors.border}30`,
                              }
                            : {}),
                        }}
                      >
                        <Text
                          variant="body"
                          className="text-base leading-6"
                          style={{
                            color: msg.role === 'user' ? '#fff' : themeColors.text,
                          }}
                        >
                          {msg.content}
                        </Text>
                      </View>
                    ) : null}

                    {hasTransactions ? (
                      <View className={`w-full gap-2.5 ${msg.content ? 'mt-2.5' : ''}`}>
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
                  </Animated.View>
                );
              })}

              {isGenerating ? (
                <Animated.View
                  entering={FadeIn.duration(200)}
                  exiting={FadeOut.duration(150)}
                  className="mb-3 self-start"
                >
                  <View
                    className="rounded-2xl rounded-bl-lg px-5 py-3.5"
                    style={{
                      backgroundColor: themeColors.surface,
                      borderWidth: 1,
                      borderColor: `${themeColors.border}30`,
                    }}
                  >
                    <TypingDots color={themeColors.primary} />
                  </View>
                </Animated.View>
              ) : null}
            </ScrollView>
          )}

          <ChatInput
            autoFocus
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
          {!keyboardVisible && <View style={{ height: safeBottom }} />}
        </View>
      )}

      <Modal
        visible={showSettingsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowSettingsModal(false);
          setExpandedSettingsSection(null);
        }}
      >
        <SettingsPageLayout edges={['top', 'bottom']}>
          <View style={styles.headerWrap}>
            <SettingsHeader
              className="px-0 pt-5 pb-3"
              title={I18n.t('aiChat.settings_title')}
              onClose={() => {
                setShowSettingsModal(false);
                setExpandedSettingsSection(null);
              }}
            />
          </View>

          <ScrollView className="flex-1" contentContainerStyle={styles.settingsContent}>
            <Text variant="caption" tone="muted" className="mb-4 px-1">
              {I18n.t('aiChat.settings_description')}
            </Text>

            {/* ── Default Account ── */}
            <Card className="mb-3">
              <Pressable
                onPress={() => {
                  if (isSimpleMode) return;
                  void triggerHaptic('selection');
                  setExpandedSettingsSection((prev) =>
                    prev === 'account' ? null : 'account',
                  );
                }}
                className="flex-row items-center gap-3"
              >
                <View
                  style={[
                    styles.sectionIconBadge,
                    { backgroundColor: `${themeColors.primary}12` },
                  ]}
                >
                  <Landmark size={19} color={themeColors.primary} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="label" tone="muted">
                    {I18n.t('aiChat.account_section_title')}
                  </Text>
                  {isSimpleMode ? (
                    <Text variant="bodyStrong">
                      {simpleWallet?.name ?? I18n.t('aiChat.no_default_account')}
                    </Text>
                  ) : defaultAiChatAccount ? (
                    <Text
                      variant="bodyStrong"
                      style={{ color: themeColors.primary }}
                    >
                      {defaultAiChatAccount.name}
                    </Text>
                  ) : (
                    <Text variant="friendly" tone="muted">
                      {I18n.t('aiChat.no_default_account')}
                    </Text>
                  )}
                </View>
                {!isSimpleMode ? (
                  <View
                    style={[
                      styles.chevronBadge,
                      { backgroundColor: `${themeColors.border}20` },
                    ]}
                  >
                    <ChevronDown
                      size={15}
                      color={themeColors.textMuted}
                      style={
                        expandedSettingsSection === 'account'
                          ? styles.chevronRotated
                          : undefined
                      }
                    />
                  </View>
                ) : null}
              </Pressable>

              {expandedSettingsSection === 'account' && !isSimpleMode ? (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  exiting={FadeOut.duration(150)}
                >
                  <View className="mt-4 gap-2.5">
                    <View
                      className="overflow-hidden rounded-2xl border border-border/20"
                      style={styles.accountPanelWrap}
                    >
                      <AccountPanel
                        accounts={accounts}
                        accountGroups={accountGroups}
                        selectedId={settings.aiChatDefaultAccountId}
                        onSelect={(accountId) => {
                          void triggerHaptic('selection');
                          updateSettings({
                            aiChatDefaultAccountId:
                              accountId === settings.aiChatDefaultAccountId
                                ? null
                                : accountId,
                          });
                        }}
                      />
                    </View>
                    {defaultAiChatAccount ? (
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          updateSettings({ aiChatDefaultAccountId: null });
                        }}
                        className="flex-row items-center justify-center gap-1.5 rounded-xl py-2"
                        style={{
                          backgroundColor: `${themeColors.error}0A`,
                          borderWidth: 1,
                          borderColor: `${themeColors.error}20`,
                        }}
                      >
                        <X size={13} color={themeColors.error} />
                        <Text
                          variant="caption"
                          className="font-semibold"
                          style={{ color: themeColors.error }}
                        >
                          {I18n.t('common.clear')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Animated.View>
              ) : null}
            </Card>

            {/* ── Default Expense Category ── */}
            <Card className="mb-3">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setExpandedSettingsSection((prev) =>
                    prev === 'expense' ? null : 'expense',
                  );
                }}
                className="flex-row items-center gap-3"
              >
                <View
                  style={[
                    styles.sectionIconBadge,
                    { backgroundColor: `${themeColors.coral}12` },
                  ]}
                >
                  <ArrowUpRight size={19} color={themeColors.coral} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="label" tone="muted">
                    {I18n.t('aiChat.expense_category_section_title')}
                  </Text>
                  {defaultAiChatExpenseCategory ? (
                    <Text
                      variant="bodyStrong"
                      style={{ color: themeColors.primary }}
                    >
                      {resolveCategoryIcon(defaultAiChatExpenseCategory.icon)}{' '}
                      {defaultAiChatExpenseCategory.name}
                    </Text>
                  ) : (
                    <Text variant="friendly" tone="muted">
                      {I18n.t('aiChat.no_default_expense_category')}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.chevronBadge,
                    { backgroundColor: `${themeColors.border}20` },
                  ]}
                >
                  <ChevronDown
                    size={15}
                    color={themeColors.textMuted}
                    style={
                      expandedSettingsSection === 'expense'
                        ? styles.chevronRotated
                        : undefined
                    }
                  />
                </View>
              </Pressable>

              {expandedSettingsSection === 'expense' ? (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  exiting={FadeOut.duration(150)}
                >
                  <View className="mt-4 gap-2.5">
                    <View
                      className="overflow-hidden rounded-2xl border border-border/20"
                      style={styles.categoryPanelWrap}
                    >
                      <CategoryPanel
                        parents={expenseCategoryPanelData.parents}
                        childByParent={expenseCategoryPanelData.childByParent}
                        allowParentSelection
                        selectedCategoryId={settings.aiChatDefaultExpenseCategoryId}
                        onSelect={(categoryId) => {
                          void triggerHaptic('selection');
                          updateSettings({
                            aiChatDefaultExpenseCategoryId:
                              categoryId === settings.aiChatDefaultExpenseCategoryId
                                ? null
                                : categoryId,
                          });
                        }}
                      />
                    </View>
                    {defaultAiChatExpenseCategory ? (
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          updateSettings({ aiChatDefaultExpenseCategoryId: null });
                        }}
                        className="flex-row items-center justify-center gap-1.5 rounded-xl py-2"
                        style={{
                          backgroundColor: `${themeColors.error}0A`,
                          borderWidth: 1,
                          borderColor: `${themeColors.error}20`,
                        }}
                      >
                        <X size={13} color={themeColors.error} />
                        <Text
                          variant="caption"
                          className="font-semibold"
                          style={{ color: themeColors.error }}
                        >
                          {I18n.t('common.clear')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Animated.View>
              ) : null}
            </Card>

            {/* ── Default Income Category ── */}
            <Card className="mb-3">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setExpandedSettingsSection((prev) =>
                    prev === 'income' ? null : 'income',
                  );
                }}
                className="flex-row items-center gap-3"
              >
                <View
                  style={[
                    styles.sectionIconBadge,
                    { backgroundColor: `${themeColors.success}12` },
                  ]}
                >
                  <ArrowDownLeft size={19} color={themeColors.success} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="label" tone="muted">
                    {I18n.t('aiChat.income_category_section_title')}
                  </Text>
                  {defaultAiChatIncomeCategory ? (
                    <Text
                      variant="bodyStrong"
                      style={{ color: themeColors.primary }}
                    >
                      {resolveCategoryIcon(defaultAiChatIncomeCategory.icon)}{' '}
                      {defaultAiChatIncomeCategory.name}
                    </Text>
                  ) : (
                    <Text variant="friendly" tone="muted">
                      {I18n.t('aiChat.no_default_income_category')}
                    </Text>
                  )}
                </View>
                <View
                  style={[
                    styles.chevronBadge,
                    { backgroundColor: `${themeColors.border}20` },
                  ]}
                >
                  <ChevronDown
                    size={15}
                    color={themeColors.textMuted}
                    style={
                      expandedSettingsSection === 'income'
                        ? styles.chevronRotated
                        : undefined
                    }
                  />
                </View>
              </Pressable>

              {expandedSettingsSection === 'income' ? (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  exiting={FadeOut.duration(150)}
                >
                  <View className="mt-4 gap-2.5">
                    <View
                      className="overflow-hidden rounded-2xl border border-border/20"
                      style={styles.categoryPanelWrap}
                    >
                      <CategoryPanel
                        parents={incomeCategoryPanelData.parents}
                        childByParent={incomeCategoryPanelData.childByParent}
                        allowParentSelection
                        selectedCategoryId={settings.aiChatDefaultIncomeCategoryId}
                        onSelect={(categoryId) => {
                          void triggerHaptic('selection');
                          updateSettings({
                            aiChatDefaultIncomeCategoryId:
                              categoryId === settings.aiChatDefaultIncomeCategoryId
                                ? null
                                : categoryId,
                          });
                        }}
                      />
                    </View>
                    {defaultAiChatIncomeCategory ? (
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          updateSettings({ aiChatDefaultIncomeCategoryId: null });
                        }}
                        className="flex-row items-center justify-center gap-1.5 rounded-xl py-2"
                        style={{
                          backgroundColor: `${themeColors.error}0A`,
                          borderWidth: 1,
                          borderColor: `${themeColors.error}20`,
                        }}
                      >
                        <X size={13} color={themeColors.error} />
                        <Text
                          variant="caption"
                          className="font-semibold"
                          style={{ color: themeColors.error }}
                        >
                          {I18n.t('common.clear')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </Animated.View>
              ) : null}
            </Card>

            {/* ── Model Selection ── */}
            <Card className="mb-3">
              <View className="flex-row items-center gap-3 mb-3">
                <View
                  style={[
                    styles.sectionIconBadge,
                    { backgroundColor: `${themeColors.primary}12` },
                  ]}
                >
                  <HardDrive size={19} color={themeColors.primary} />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text variant="label" tone="muted">
                    {I18n.t('aiChat.model_section_title')}
                  </Text>
                </View>
              </View>

              <View className="gap-2">
                {AVAILABLE_MODELS.map((model) => {
                  const isActive = model.id === activeModel.id && !switchingModelId;
                  const isSwitchingTo = model.id === switchingModelId;
                  const isDownloaded = modelManager.isModelDownloaded(model.fileName);
                  const isDownloading = isSwitchingTo && switchingModelDownloadProgress != null;
                  const downloadPercent = isDownloading
                    ? Math.round(switchingModelDownloadProgress * 100)
                    : null;

                  return (
                    <View key={model.id}>
                      <Pressable
                        onPress={() => void handleSwitchModel(model)}
                        disabled={(isActive && modelStatus === 'ready') || !!switchingModelId}
                        className="flex-row items-center gap-3 rounded-2xl border px-4 py-3"
                        style={{
                          borderColor: (isActive || isSwitchingTo)
                            ? `${themeColors.primary}40`
                            : `${themeColors.border}30`,
                          backgroundColor: (isActive || isSwitchingTo)
                            ? `${themeColors.primary}08`
                            : 'transparent',
                          borderBottomLeftRadius: isDownloading ? 0 : undefined,
                          borderBottomRightRadius: isDownloading ? 0 : undefined,
                        }}
                      >
                        <View className="flex-1">
                          <Text variant="bodyStrong">{model.displayName}</Text>
                          <Text variant="caption" tone="muted">
                            {model.sizeLabel}
                          </Text>
                        </View>

                        {isActive && isDownloaded && modelStatus === 'ready' ? (
                          <View
                            className="h-8 w-8 items-center justify-center rounded-full"
                            style={{ backgroundColor: `${themeColors.primary}20` }}
                          >
                            <Check size={16} color={themeColors.primary} />
                          </View>
                        ) : isSwitchingTo ? (
                          <View className="items-end">
                            <ActivityIndicator size="small" color={themeColors.primary} />
                          </View>
                        ) : !isDownloaded ? (
                          <View className="flex-row items-center gap-1.5">
                            <Download size={14} color={themeColors.primary} />
                            <Text variant="caption" style={{ color: themeColors.primary }}>
                              {I18n.t('aiChat.download')}
                            </Text>
                          </View>
                        ) : null}
                      </Pressable>
                      {isDownloading ? (
                        <View
                          className="rounded-b-2xl overflow-hidden px-4 pb-3 pt-2"
                          style={{
                            borderWidth: 1,
                            borderTopWidth: 0,
                            borderColor: `${themeColors.primary}40`,
                            backgroundColor: `${themeColors.primary}08`,
                            borderBottomLeftRadius: 16,
                            borderBottomRightRadius: 16,
                          }}
                        >
                          <View
                            className="h-2 overflow-hidden rounded-full"
                            style={{ backgroundColor: `${themeColors.border}30` }}
                          >
                            <View
                              className="h-full rounded-full"
                              style={{
                                width: `${downloadPercent ?? 0}%`,
                                backgroundColor: themeColors.primary,
                              }}
                            />
                          </View>
                          <Text variant="caption" tone="muted" className="mt-1.5 text-center">
                            {I18n.t('aiChat.downloading_local_ai_progress', {
                              progress: downloadPercent ?? 0,
                            })}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </Card>

            {/* ── Danger Zone ── */}
            <View className="mt-5 gap-3">
              <View className="flex-row items-center gap-2 px-1">
                <View
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: themeColors.error,
                    opacity: 0.6,
                  }}
                />
                <Text
                  variant="label"
                  className="text-[11px] tracking-widest text-destructive"
                >
                  {I18n.t('aiChat.disable_section_title')}
                </Text>
              </View>

              <Card variant="outline" className="border-destructive/15">
                <View className="flex-row items-start gap-3">
                  <View
                    style={[
                      styles.sectionIconBadge,
                      { backgroundColor: `${themeColors.error}0E` },
                    ]}
                  >
                    <Trash2 size={18} color={themeColors.error} />
                  </View>
                  <Text
                    variant="caption"
                    tone="muted"
                    className="flex-1 pt-2"
                  >
                    {I18n.t('aiChat.disable_section_subtitle')}
                  </Text>
                </View>
                <Button
                  variant="outline"
                  className="mt-4 border-destructive/25 bg-destructive/5"
                  onPress={() => {
                    void handleDisableAiFeature();
                  }}
                >
                  <Text variant="bodyStrong" className="text-destructive">
                    {I18n.t('aiChat.disable_button')}
                  </Text>
                </Button>
              </Card>
            </View>
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
    </KeyboardAvoidingView>
  );
}

/* ---------- Sub-components ---------- */

function GatePulseIcon({ color }: { color: string }) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 1200 }),
        withTiming(1, { duration: 1200 }),
      ),
      -1,
      false,
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1200 }),
        withTiming(0.5, { duration: 1200 }),
      ),
      -1,
      false,
    );
  }, [pulseOpacity, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  return (
    <View className="items-center justify-center" style={{ width: 72, height: 72 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: `${color}20`,
          },
          pulseStyle,
        ]}
      />
      <View
        className="h-16 w-16 items-center justify-center rounded-full"
        style={{
          backgroundColor: `${color}12`,
          borderWidth: 1,
          borderColor: `${color}25`,
        }}
      >
        <Sparkles size={26} color={color} />
      </View>
    </View>
  );
}

function FeatureChip({
  icon,
  label,
  color,
  bgColor,
  borderColor,
}: {
  icon: React.ReactElement;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <View
      className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
      style={{
        backgroundColor: `${bgColor}80`,
        borderWidth: 1,
        borderColor: `${borderColor}40`,
      }}
    >
      {icon}
      <Text variant="caption" className="text-[11px] font-medium" style={{ color }}>
        {label}
      </Text>
    </View>
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
  emptyMessagesContent: {
    justifyContent: 'center',
  },
  gateContent: {
    paddingTop: 32,
  },
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  settingsContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  sectionIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chevronBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
  accountPanelWrap: {
    height: 200,
  },
  categoryPanelWrap: {
    height: 240,
  },
});
