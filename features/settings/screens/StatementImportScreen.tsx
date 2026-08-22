import * as Clipboard from 'expo-clipboard';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CirclePlay,
  ClipboardPaste,
  Copy,
  X,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Mascot } from '~/components/feedback/Mascot';
import {
  Button,
  Card,
  CardContent,
  CurrencyPickerSheet,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  detectStatementCurrency,
  parseImportJson,
  type ParsedStatement,
  type ParsedTransaction,
} from '~/features/settings/lib/statementImport';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { Account, Category, TransactionType } from '~/types';
import { formatAmount } from '~/utils/formatters';

interface StatementImportScreenProps {
  onBack: () => void;
  onOpenList: (params: {
    section: 'expense' | 'income';
    transactions: ParsedTransaction[];
    indices: number[];
    excludedIndices: number[];
    currency: string;
    onToggle: (index: number) => void;
  }) => void;
}

const CHATGPT_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.998 5.998 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" fill="currentColor"/></svg>`;

const CLAUDE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" fill="currentColor"/></svg>`;

const GEMINI_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" fill="currentColor"/></svg>`;

const AI_LINKS = [
  {
    svg: CLAUDE_SVG,
    appUrl: 'claude://',
    webUrl: 'https://claude.ai',
    label: 'Claude',
    color: '#D97757',
  },
  {
    svg: CHATGPT_SVG,
    appUrl: 'chatgpt://',
    webUrl: 'https://chat.openai.com',
    label: 'GPT',
    color: null,
  },
  {
    svg: GEMINI_SVG,
    appUrl: null,
    webUrl: 'https://gemini.google.com',
    label: 'Gemini',
    color: '#4285F4',
  },
] as const;

function formatCategoryTree(categories: Category[], type: 'expense' | 'income'): string {
  const parents = categories.filter((c) => c.type === type && !c.parentId);
  const childrenByParent = new Map<string, Category[]>();
  for (const c of categories) {
    if (c.type === type && c.parentId) {
      const list = childrenByParent.get(c.parentId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentId, list);
    }
  }
  const lines: string[] = [];
  for (const parent of parents) {
    const children = childrenByParent.get(parent.id);
    if (children && children.length > 0) {
      lines.push(`- ${parent.name}: ${children.map((c) => c.name).join(', ')}`);
    } else {
      lines.push(`- ${parent.name}`);
    }
  }
  return lines.join('\n');
}

function buildPrompt(accounts: Account[], categories: Category[]): string {
  const accountNames = accounts.map((a) => a.name).join(', ');
  const expenseTree = formatCategoryTree(categories, 'expense');
  const incomeTree = formatCategoryTree(categories, 'income');

  return I18n.t('statement_import.prompt_template', {
    accounts: accountNames,
    expenses: expenseTree,
    incomes: incomeTree,
  });
}

function getParseErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    switch (error.message) {
      case 'missing_transactions':
      case 'empty_transactions':
        return I18n.t('statement_import.import_error_no_transactions');
      case 'invalid_transaction':
        return I18n.t('statement_import.import_error_invalid_transaction');
      default:
        return I18n.t('statement_import.import_error_invalid_json');
    }
  }
  return I18n.t('statement_import.import_error_generic');
}

export function StatementImportScreen({ onBack, onOpenList }: StatementImportScreenProps) {
  const {
    accounts: allAccounts,
    categories,
    settings,
    isSimpleMode,
    simpleWalletId,
    createTransaction,
  } = useApp();
  // Bank statements never import into savings goals or loans; money moves into
  // both by transfer, not by an imported statement line.
  const accounts = useMemo(
    () => allAccounts.filter((a) => a.type !== 'goal' && a.type !== 'loan'),
    [allAccounts],
  );
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const [didCopyPrompt, setDidCopyPrompt] = useState(false);
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    isSimpleMode ? simpleWalletId : null,
  );
  const [accountMapping, setAccountMapping] = useState<Record<string, string | null>>({});
  // Explicit user pick. Null means "follow the statement / account default"
  // resolved by `importCurrency` below, so pasting a new statement re-detects.
  const [currencyOverride, setCurrencyOverride] = useState<string | null>(null);
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importExpenses, setImportExpenses] = useState(true);
  const [importIncome, setImportIncome] = useState(true);
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
  const scrollViewRef = useRef<ScrollView>(null);

  const prompt = useMemo(() => buildPrompt(accounts, categories), [accounts, categories]);

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ label: a.name, value: a.id })),
    [accounts],
  );

  const categoryNameToId = useMemo(() => {
    const map = new Map<string, string>();
    const byId = new Map(categories.map((c) => [c.id, c]));
    // Add children first so parent categories win on plain-name collisions
    for (const cat of categories) {
      if (cat.parentId) {
        map.set(cat.name.toLowerCase(), cat.id);
        const parent = byId.get(cat.parentId);
        if (parent) {
          map.set(`${parent.name.toLowerCase()} > ${cat.name.toLowerCase()}`, cat.id);
        }
      }
    }
    // Parents overwrite plain-name keys so "Food" resolves to the parent if both exist
    for (const cat of categories) {
      if (!cat.parentId) {
        map.set(cat.name.toLowerCase(), cat.id);
      }
    }
    return map;
  }, [categories]);

  // Currency the statement rows are denominated in. A MYR statement imported by
  // an SGD user must be stored as MYR: `createTransaction` then snapshots the
  // SGD reporting amount at the rate of the day, exactly like a foreign
  // transaction entered by hand.
  const detectedCurrency = useMemo(
    () => (parsed ? detectStatementCurrency(parsed) : undefined),
    [parsed],
  );

  // Falls back to the destination account's own currency before the reporting
  // currency, so a MYR account picks the right code without the model naming it.
  const defaultAccountCurrency = useMemo(() => {
    const accountId = isSimpleMode ? simpleWalletId : selectedAccountId;
    if (!accountId) return undefined;
    return allAccounts.find((a) => a.id === accountId)?.currency ?? undefined;
  }, [allAccounts, isSimpleMode, selectedAccountId, simpleWalletId]);

  const importCurrency =
    currencyOverride ?? detectedCurrency ?? defaultAccountCurrency ?? settings.currencyCode;

  const convertsToReporting = importCurrency !== settings.currencyCode;

  const uniqueAccounts = useMemo(() => {
    if (!parsed) return [];
    const names = new Set<string>();
    for (const tx of parsed.transactions) {
      if (tx.account) names.add(tx.account);
    }
    return [...names];
  }, [parsed]);

  const isMultiAccount = uniqueAccounts.length > 1;

  const handleCopyPrompt = useCallback(() => {
    void Clipboard.setStringAsync(prompt);
    setDidCopyPrompt(true);
    void triggerHaptic('success');
    setTimeout(() => setDidCopyPrompt(false), 1500);
  }, [prompt]);

  const handleOpenAI = useCallback(async (appUrl: string | null, webUrl: string) => {
    if (appUrl) {
      const canOpen = await Linking.canOpenURL(appUrl);
      if (canOpen) {
        try {
          await Linking.openURL(appUrl);
          return;
        } catch {
          // App scheme registered but failed to open, fall through to web
        }
      }
    }
    void Linking.openURL(webUrl).catch(() => undefined);
  }, []);

  const handlePaste = useCallback(async () => {
    setParseError(null);
    const text = await Clipboard.getStringAsync();

    if (!text || !text.trim()) {
      void triggerHaptic('warning');
      setParseError(I18n.t('statement_import.import_error_empty_clipboard'));
      return;
    }

    try {
      const result = parseImportJson(text);
      setParsed(result);
      setCurrencyOverride(null);
      setParseError(null);
      void triggerHaptic('success');
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setParsed(null);
      void triggerHaptic('warning');
      setParseError(getParseErrorMessage(e));
    }
  }, []);

  const handleClear = useCallback(() => {
    setParsed(null);
    setParseError(null);
    setImportExpenses(true);
    setImportIncome(true);
    setExcludedIndices(new Set());
    setAccountMapping({});
    setCurrencyOverride(null);
  }, []);

  const toggleExpenseCheckbox = useCallback(() => {
    setImportExpenses((prev) => {
      if (prev && !importIncome) return prev;
      return !prev;
    });
  }, [importIncome]);

  const toggleIncomeCheckbox = useCallback(() => {
    setImportIncome((prev) => {
      if (prev && !importExpenses) return prev;
      return !prev;
    });
  }, [importExpenses]);

  const toggleTransactionExclusion = useCallback((index: number) => {
    setExcludedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (!parsed) return;

    if (!isSimpleMode && isMultiAccount) {
      const unmapped = uniqueAccounts.filter((name) => !accountMapping[name]);
      if (unmapped.length > 0) {
        void triggerHaptic('warning');
        Alert.alert(
          I18n.t('statement_import.import_error_title'),
          I18n.t('statement_import.account_mapping_required'),
        );
        return;
      }
    } else if (!isSimpleMode && !selectedAccountId) {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('statement_import.import_error_title'),
        I18n.t('statement_import.account_required'),
      );
      return;
    }

    setIsImporting(true);

    await new Promise((r) => setTimeout(r, 0));

    let imported = 0;

    for (let i = 0; i < parsed.transactions.length; i++) {
      if (excludedIndices.has(i)) continue;

      const tx = parsed.transactions[i];
      const type: TransactionType = tx.amount < 0 ? 'expense' : 'income';

      if (type === 'expense' && !importExpenses) continue;
      if (type === 'income' && !importIncome) continue;

      let accountId: string | null;
      if (isSimpleMode) {
        accountId = simpleWalletId;
      } else if (isMultiAccount && tx.account) {
        accountId = accountMapping[tx.account] ?? null;
      } else {
        accountId = selectedAccountId;
      }

      const resolvedCategoryId = tx.category
        ? (categoryNameToId.get(tx.category.toLowerCase()) ?? null)
        : null;

      const input: CreateTransactionInput = {
        type,
        amount: Math.abs(tx.amount),
        currency: importCurrency,
        date: tx.date,
        accountId: accountId,
        categoryId: resolvedCategoryId,
        note: tx.description,
      };
      createTransaction(input);
      imported++;
    }

    setIsImporting(false);
    void triggerHaptic('success');
    void trackEvent(AnalyticsEvents.STATEMENT_IMPORT_COMPLETED, {
      imported_count: imported,
      currency: importCurrency,
      converted: convertsToReporting,
    });
    Alert.alert(
      I18n.t('statement_import.import_success_title'),
      I18n.t('statement_import.import_success_message', { count: imported }),
    );
    setParsed(null);
    setParseError(null);
    setImportExpenses(true);
    setImportIncome(true);
    setExcludedIndices(new Set());
    setAccountMapping({});
    setCurrencyOverride(null);
  }, [
    parsed,
    selectedAccountId,
    isSimpleMode,
    isMultiAccount,
    uniqueAccounts,
    accountMapping,
    simpleWalletId,
    categoryNameToId,
    importCurrency,
    convertsToReporting,
    createTransaction,
    excludedIndices,
    importExpenses,
    importIncome,
  ]);

  const expenseIndices = useMemo(() => {
    if (!parsed) return [];
    return parsed.transactions
      .map((tx, i) => ({ tx, i }))
      .filter(({ tx }) => tx.amount < 0)
      .map(({ i }) => i);
  }, [parsed]);

  const incomeIndices = useMemo(() => {
    if (!parsed) return [];
    return parsed.transactions
      .map((tx, i) => ({ tx, i }))
      .filter(({ tx }) => tx.amount > 0)
      .map(({ i }) => i);
  }, [parsed]);

  const expenseCount = expenseIndices.length;
  const incomeCount = incomeIndices.length;

  const selectedExpenseCount = useMemo(
    () => expenseIndices.filter((i) => !excludedIndices.has(i)).length,
    [expenseIndices, excludedIndices],
  );

  const selectedIncomeCount = useMemo(
    () => incomeIndices.filter((i) => !excludedIndices.has(i)).length,
    [incomeIndices, excludedIndices],
  );

  const totalExpenses = useMemo(() => {
    if (!parsed) return 0;
    return expenseIndices
      .filter((i) => !excludedIndices.has(i))
      .reduce((sum, i) => sum + Math.abs(parsed.transactions[i].amount), 0);
  }, [parsed, expenseIndices, excludedIndices]);

  const totalIncome = useMemo(() => {
    if (!parsed) return 0;
    return incomeIndices
      .filter((i) => !excludedIndices.has(i))
      .reduce((sum, i) => sum + parsed.transactions[i].amount, 0);
  }, [parsed, incomeIndices, excludedIndices]);

  const totalImportCount = useMemo(() => {
    let count = 0;
    if (importExpenses) count += selectedExpenseCount;
    if (importIncome) count += selectedIncomeCount;
    return count;
  }, [importExpenses, importIncome, selectedExpenseCount, selectedIncomeCount]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('statement_import.title')}
      />

      <ScrollView
        ref={scrollViewRef}
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
      >
        <View className="items-center pt-1 pb-4">
          {isImporting ? (
            <Mascot size={88} sequence="scan" />
          ) : (
            <Mascot size={88} name="receipt" animate />
          )}
        </View>
        {/* Step 1 */}
        <View>
          <View className="mb-2 flex-row items-center gap-2 px-1">
            <View
              className="h-6 w-6 items-center justify-center rounded-full"
              style={{ backgroundColor: `${themeColors.primary}20` }}
            >
              <Text variant="caption" className="text-primary text-[11px]">
                1
              </Text>
            </View>
            <Text variant="bodyStrong">{I18n.t('statement_import.step1_title')}</Text>
          </View>

          <Card>
            <CardContent className="gap-4">
              <Button variant="outline" onPress={handleCopyPrompt}>
                <View className="flex-row items-center gap-2">
                  {didCopyPrompt ? (
                    <Check size={16} color={themeColors.primary} />
                  ) : (
                    <Copy size={16} color={themeColors.text} />
                  )}
                  <Text>
                    {didCopyPrompt
                      ? I18n.t('common.copied')
                      : I18n.t('statement_import.copy_prompt')}
                  </Text>
                </View>
              </Button>

              <Text variant="caption" tone="muted" className="text-center">
                {I18n.t('statement_import.step1_instructions')}
              </Text>

              <View className="flex-row items-center gap-3">
                <View className="flex-1" style={styles.thinDivider} />
                <Text variant="caption" tone="muted">
                  {I18n.t('statement_import.open_in')}
                </Text>
                <View className="flex-1" style={styles.thinDivider} />
              </View>

              <View className="flex-row justify-center gap-3">
                {AI_LINKS.map((link) => (
                  <Pressable
                    key={link.webUrl}
                    onPress={() => void handleOpenAI(link.appUrl, link.webUrl)}
                    className="h-12 w-12 items-center justify-center rounded-2xl border border-border/30 bg-secondary/40 active:opacity-70"
                  >
                    <SvgXml
                      xml={link.svg}
                      width={22}
                      height={22}
                      color={link.color ?? themeColors.text}
                    />
                  </Pressable>
                ))}
              </View>

              <Text variant="caption" tone="muted" className="text-center text-[11px]">
                {I18n.t('statement_import.step1_recommended')}
              </Text>

              <View className="flex-row items-center gap-3">
                <View className="flex-1" style={styles.thinDivider} />
              </View>

              <Pressable
                onPress={() =>
                  void Linking.openURL('https://www.youtube.com/shorts/3XC6Zjwl7eM').catch(
                    () => undefined,
                  )
                }
                className="flex-row items-center justify-center gap-1.5 active:opacity-50"
              >
                <CirclePlay size={14} color={themeColors.primary} />
                <Text variant="caption" style={{ color: themeColors.primary }}>
                  {I18n.t('statement_import.how_to_video')}
                </Text>
              </Pressable>
            </CardContent>
          </Card>
        </View>

        {/* Connector */}
        <View className="items-center py-3">
          <ArrowRight
            size={18}
            color={themeColors.textMuted}
            style={{ transform: [{ rotate: '90deg' }] }}
          />
        </View>

        {/* Step 2 */}
        <View>
          <View className="mb-2 flex-row items-center gap-2 px-1">
            <View
              className="h-6 w-6 items-center justify-center rounded-full"
              style={{ backgroundColor: `${themeColors.primary}20` }}
            >
              <Text variant="caption" className="text-primary text-[11px]">
                2
              </Text>
            </View>
            <Text variant="bodyStrong">{I18n.t('statement_import.step2_title')}</Text>
          </View>

          {!parsed ? (
            <Card>
              <CardContent className="gap-4">
                <Text variant="caption" tone="muted">
                  {I18n.t('statement_import.step2_description')}
                </Text>

                <Button variant="outline" onPress={() => void handlePaste()}>
                  <View className="flex-row items-center gap-2">
                    <ClipboardPaste size={16} color={themeColors.text} />
                    <Text>{I18n.t('statement_import.paste_json')}</Text>
                  </View>
                </Button>

                {parseError ? (
                  <View className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3">
                    <Text variant="caption" className="text-destructive">
                      {parseError}
                    </Text>
                  </View>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <View className="gap-3">
              <Card>
                <CardContent className="gap-0">
                  {/* Header row */}
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-3">
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {parsed.statement?.issuer ?? I18n.t('statement_import.preview_title')}
                      </Text>
                      {parsed.statement?.period?.start && parsed.statement?.period?.end ? (
                        <Text variant="caption" tone="muted" className="mt-1">
                          {new Date(parsed.statement.period.start).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                          {' — '}
                          {new Date(parsed.statement.period.end).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={handleClear}
                      hitSlop={8}
                      className="mt-0.5 items-center justify-center active:opacity-50"
                    >
                      <X size={16} color={themeColors.textMuted} />
                    </Pressable>
                  </View>

                  {/* Expense row */}
                  {expenseCount > 0 ? (
                    <View className="mt-4 flex-row items-center gap-3">
                      <Pressable
                        onPress={toggleExpenseCheckbox}
                        hitSlop={8}
                        className="h-[22px] w-[22px] items-center justify-center rounded-md"
                        style={{
                          backgroundColor: importExpenses ? themeColors.error : 'transparent',
                          borderWidth: importExpenses ? 0 : 1.5,
                          borderColor: importExpenses ? undefined : themeColors.textMuted + '50',
                        }}
                      >
                        {importExpenses ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          onOpenList({
                            section: 'expense',
                            transactions: parsed!.transactions,
                            indices: expenseIndices,
                            excludedIndices: [...excludedIndices],
                            currency: importCurrency,
                            onToggle: toggleTransactionExclusion,
                          })
                        }
                        className="flex-1 flex-row items-center rounded-xl px-4 py-3 active:opacity-70"
                        style={{ backgroundColor: themeColors.errorSoft }}
                      >
                        <View className="flex-1">
                          <Text variant="mono" style={{ color: themeColors.error, fontSize: 15 }}>
                            -
                            {formatAmount(totalExpenses, settings, {
                              currencyCode: importCurrency,
                            })}
                          </Text>
                          <Text variant="caption" tone="muted" className="mt-0.5 text-[11px]">
                            {selectedExpenseCount < expenseCount
                              ? `${selectedExpenseCount}/${expenseCount}`
                              : `${expenseCount}`}{' '}
                            {I18n.t('statement_import.expenses').toLowerCase()}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={themeColors.textMuted} />
                      </Pressable>
                    </View>
                  ) : null}

                  {/* Income row */}
                  {incomeCount > 0 ? (
                    <View className="mt-3 flex-row items-center gap-3">
                      <Pressable
                        onPress={toggleIncomeCheckbox}
                        hitSlop={8}
                        className="h-[22px] w-[22px] items-center justify-center rounded-md"
                        style={{
                          backgroundColor: importIncome ? themeColors.success : 'transparent',
                          borderWidth: importIncome ? 0 : 1.5,
                          borderColor: importIncome ? undefined : themeColors.textMuted + '50',
                        }}
                      >
                        {importIncome ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          onOpenList({
                            section: 'income',
                            transactions: parsed!.transactions,
                            indices: incomeIndices,
                            excludedIndices: [...excludedIndices],
                            currency: importCurrency,
                            onToggle: toggleTransactionExclusion,
                          })
                        }
                        className="flex-1 flex-row items-center rounded-xl px-4 py-3 active:opacity-70"
                        style={{ backgroundColor: themeColors.successSoft }}
                      >
                        <View className="flex-1">
                          <Text variant="mono" style={{ color: themeColors.success, fontSize: 15 }}>
                            +
                            {formatAmount(totalIncome, settings, {
                              currencyCode: importCurrency,
                            })}
                          </Text>
                          <Text variant="caption" tone="muted" className="mt-0.5 text-[11px]">
                            {selectedIncomeCount < incomeCount
                              ? `${selectedIncomeCount}/${incomeCount}`
                              : `${incomeCount}`}{' '}
                            {I18n.t('statement_import.income').toLowerCase()}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={themeColors.textMuted} />
                      </Pressable>
                    </View>
                  ) : null}

                  {/* Statement currency */}
                  <View className="mt-4 gap-1.5">
                    <Text variant="caption" className="text-[12px]">
                      {I18n.t('statement_import.currency_label')}
                    </Text>
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setCurrencyPickerVisible(true);
                      }}
                      className="h-[54px] flex-row items-center justify-between rounded-3xl border border-border/40 bg-card/95 px-4 active:opacity-70"
                    >
                      <Text variant="body">{importCurrency}</Text>
                      <ChevronRight size={16} color={themeColors.textMuted} />
                    </Pressable>
                    <Text variant="caption" tone="muted" className="text-[11px]">
                      {convertsToReporting
                        ? I18n.t('statement_import.currency_hint_converted', {
                            statement: importCurrency,
                            reporting: settings.currencyCode,
                          })
                        : I18n.t('statement_import.currency_hint')}
                    </Text>
                  </View>

                  {/* Account selector / mapping (power mode only) */}
                  {!isSimpleMode ? (
                    isMultiAccount ? (
                      <View className="mt-4 gap-3">
                        {uniqueAccounts.map((aiAccount) => (
                          <View key={aiAccount} className="gap-1.5">
                            <Text variant="caption" className="text-[12px]">
                              {aiAccount}
                            </Text>
                            <SelectField
                              value={accountMapping[aiAccount] ?? null}
                              options={accountOptions}
                              placeholder={I18n.t('statement_import.account_placeholder')}
                              onChange={(val) =>
                                setAccountMapping((prev) => ({ ...prev, [aiAccount]: val }))
                              }
                            />
                          </View>
                        ))}
                      </View>
                    ) : (
                      <View className="mt-4">
                        <SelectField
                          value={selectedAccountId}
                          options={accountOptions}
                          placeholder={I18n.t('statement_import.account_placeholder')}
                          onChange={setSelectedAccountId}
                        />
                      </View>
                    )
                  ) : null}
                </CardContent>
              </Card>

              {/* Import button */}
              <Button
                onPress={() => void handleImport()}
                disabled={isImporting || totalImportCount === 0}
              >
                <Text>
                  {isImporting
                    ? I18n.t('statement_import.importing')
                    : I18n.t('statement_import.import_action', {
                        count: totalImportCount,
                      })}
                </Text>
              </Button>
            </View>
          )}
        </View>
      </ScrollView>

      <CurrencyPickerSheet
        visible={currencyPickerVisible}
        onClose={() => setCurrencyPickerVisible(false)}
        selectedCode={importCurrency}
        title={I18n.t('statement_import.currency_label')}
        onSelect={(code) => {
          void triggerHaptic('selection');
          setCurrencyOverride(code);
          setCurrencyPickerVisible(false);
        }}
      />
    </SettingsPageLayout>
  );
}

interface StatementImportListScreenProps {
  section: 'expense' | 'income';
  transactions: ParsedTransaction[];
  indices: number[];
  excludedIndices: number[];
  /** Currency the listed amounts are denominated in. */
  currency: string;
  onToggle: (index: number) => void;
  onBack: () => void;
}

export function StatementImportListScreen({
  section,
  transactions,
  indices,
  excludedIndices: initialExcluded,
  currency,
  onToggle,
  onBack,
}: StatementImportListScreenProps) {
  const { settings } = useApp();
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset();
  const [excludedSet, setExcludedSet] = useState(() => new Set(initialExcluded));
  const isExpense = section === 'expense';
  const accentColor = isExpense ? themeColors.error : themeColors.success;
  const selectedCount = indices.filter((i) => !excludedSet.has(i)).length;
  const title = isExpense ? I18n.t('statement_import.expenses') : I18n.t('statement_import.income');

  const handleToggle = useCallback(
    (idx: number) => {
      setExcludedSet((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
        }
        return next;
      });
      onToggle(idx);
    },
    [onToggle],
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={title}
        rightAccessory={
          <View className="rounded-full border border-border/40 bg-secondary/60 px-2.5 py-1">
            <Text variant="label" tone="muted" numberOfLines={1}>
              {`${selectedCount}/${indices.length} ${I18n.t('statement_import.selected').toLowerCase()}`}
            </Text>
          </View>
        }
      />
      <ScrollView className="flex-1" contentContainerStyle={[styles.listContent, listNavInset]}>
        {indices.map((idx) => {
          const tx = transactions[idx];
          const isSelected = !excludedSet.has(idx);
          return (
            <Pressable
              key={idx}
              onPress={() => handleToggle(idx)}
              className="flex-row items-center border-b px-5 py-3.5 active:opacity-70"
              style={{ borderColor: themeColors.textMuted + '15' }}
            >
              <View
                className="mr-3.5 h-[22px] w-[22px] items-center justify-center rounded-md"
                style={{
                  backgroundColor: isSelected ? accentColor : 'transparent',
                  borderWidth: isSelected ? 0 : 1.5,
                  borderColor: isSelected ? undefined : themeColors.textMuted + '50',
                }}
              >
                {isSelected ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </View>
              <Text
                variant="body"
                className="flex-1 text-[14px]"
                numberOfLines={1}
                style={{ opacity: isSelected ? 1 : 0.35 }}
              >
                {tx.description || tx.category || tx.date}
              </Text>
              <Text
                variant="mono"
                className="ml-3 text-[13px]"
                style={{
                  color: accentColor,
                  opacity: isSelected ? 1 : 0.35,
                }}
              >
                {isExpense ? '-' : '+'}
                {formatAmount(Math.abs(tx.amount), settings, { currencyCode: currency })}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  listContent: {
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  thinDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
  },
});
