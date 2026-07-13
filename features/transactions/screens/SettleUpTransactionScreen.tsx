import { Check, ChevronDown, Pencil, Send, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import {
  AccountLogo,
  AccountPickerSheet,
  Button,
  CategoryEmoji,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { SharedBadge } from '~/features/transactions/components/SharedBadge';
import type { ReceiptContent } from '~/features/transactions/components/SplitReceiptCard';
import { SplitReceiptShareModal } from '~/features/transactions/components/SplitReceiptShareModal';
import { parseSharedItemNote } from '~/features/transactions/lib/settleUp';
import { useSettleUpByTransaction } from '~/features/transactions/lib/useSettleUpSummary';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatShortDate } from '~/utils/formatters';

interface SettleUpTransactionScreenProps {
  transactionId: string;
  onBack: () => void;
  onOpenSettings: () => void;
  /** Open the full transaction editor for this bill. */
  onEdit: () => void;
}

function personInitial(name: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : '?';
}

export function SettleUpTransactionScreen({
  transactionId,
  onBack,
  onOpenSettings,
  onEdit,
}: SettleUpTransactionScreenProps) {
  const themeColors = useThemeColors();
  const {
    accounts,
    accountGroups,
    getAccountById,
    markSplitPaid,
    updateSplitPaybackAccount,
    deleteSplit,
  } = useApp();

  const [pickerForGroupKey, setPickerForGroupKey] = useState<string | null>(null);
  const [shareVisible, setShareVisible] = useState(false);

  const summary = useSettleUpByTransaction();

  const bill = useMemo(
    () => summary.transactions.find((t) => t.transactionId === transactionId) ?? null,
    [summary.transactions, transactionId],
  );

  // Roll the bill's unpaid splits up by person — a person can owe for several
  // items (their own lines plus a shared line), so group them so each person
  // shows once. Named people merge (case-folded); unnamed rows stay separate.
  // Every settle action (mark paid, delete, payback account) then operates on
  // ALL of a person's splitIds at once, matching how the receipt groups them.
  const sharedLabel = I18n.t('transactions.editor.split.shared_label');
  const personGroups = useMemo(() => {
    interface GroupItem {
      key: string;
      name: string;
      shared: boolean;
    }
    interface PersonGroup {
      key: string;
      name: string | null;
      amount: number;
      currency: string;
      splitIds: string[];
      paybackAccountId: string | null;
      items: GroupItem[];
    }
    if (!bill) return [] as PersonGroup[];
    const order: string[] = [];
    const map = new Map<string, PersonGroup>();
    for (const split of bill.splits) {
      const name = split.personName?.trim() || null;
      const key = name ? name.toLowerCase() : `anon:${split.splitId}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          name,
          amount: 0,
          currency: split.currency,
          splitIds: [],
          paybackAccountId: split.paybackAccountId ?? null,
          items: [],
        };
        map.set(key, group);
        order.push(key);
      }
      group.amount += split.amount;
      group.splitIds.push(split.splitId);
      const parsed = parseSharedItemNote(split.itemNote, sharedLabel);
      const shared = split.isShared || parsed.shared;
      if (parsed.name || shared) {
        group.items.push({ key: split.splitId, name: parsed.name, shared });
      }
    }
    return order.map((key) => map.get(key)!);
  }, [bill, sharedLabel]);

  // When the last share is settled the bill drops out of the summary; leave the
  // page so we never sit on an empty screen.
  useEffect(() => {
    if (!bill) onBack();
  }, [bill, onBack]);

  const formatNative = useCallback(
    (amount: number, currency: string) => formatCurrency(amount, currencySymbolForCode(currency)),
    [],
  );

  const handleShare = useCallback(() => {
    void triggerHaptic('selection');
    setShareVisible(true);
  }, []);

  const handleEdit = useCallback(() => {
    void triggerHaptic('selection');
    onEdit();
  }, [onEdit]);

  // Settle a person in one tap — a person's own item plus any shared line are
  // separate splits, so mark every split in the group paid together.
  const handleMarkPaid = useCallback(
    (splitIds: string[]) => {
      void triggerHaptic('success');
      splitIds.forEach((id) => markSplitPaid(id));
    },
    [markSplitPaid],
  );

  const handleDelete = useCallback(
    (splitIds: string[]) => {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('transactions.settleUp.remove_bill_title'),
        I18n.t('transactions.settleUp.remove_bill_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.remove'),
            style: 'destructive',
            onPress: () => splitIds.forEach((id) => deleteSplit(id)),
          },
        ],
      );
    },
    [deleteSplit],
  );

  const pickerGroup = useMemo(
    () => personGroups.find((g) => g.key === pickerForGroupKey) ?? null,
    [personGroups, pickerForGroupKey],
  );

  // Blank while the bill is missing (the last share just settled) so the header
  // doesn't flash a fallback title for the one frame before the screen pops.
  const title = bill
    ? bill.note?.trim() || bill.categoryName || `${I18n.t('transactions.settleUp.untitled_bill')}`
    : '';

  // Receipt: title is the bill, the date sits on top, one line per person — the
  // same person grouping the on-screen settle cards use. No grand total: the card
  // goes to a group, so each person only cares about their own line.
  const receiptContent = useMemo<ReceiptContent | null>(() => {
    if (!bill) return null;
    return {
      title,
      subtitle: formatShortDate(bill.date),
      sharedLabel,
      lines: personGroups.map((group) => {
        // Bullet lines when there are several items OR any shared item (so its
        // badge shows); a lone plain item stays a compact muted sublabel.
        const useBullets = group.items.length > 1 || group.items.some((it) => it.shared);
        return {
          key: group.key,
          initial: personInitial(group.name),
          label: group.name ?? I18n.t('transactions.settleUp.someone'),
          sublabel: !useBullets && group.items.length === 1 ? group.items[0]!.name : null,
          items: useBullets ? group.items : null,
          amount: formatNative(group.amount, group.currency),
        };
      }),
    };
  }, [bill, title, formatNative, personGroups, sharedLabel]);

  return (
    <SettingsPageLayout>
      <SettingsHeader className="px-5 pt-5 pb-3" onBack={onBack} title={title} />
      {bill ? (
        <>
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24 }}
          >
            <View className="rounded-[24px] border border-warning/25 bg-warning/10 px-5 py-4">
              <View className="flex-row items-center justify-between gap-2">
                <View className="min-w-0 flex-shrink flex-row items-center gap-2">
                  <CategoryEmoji icon={bill.categoryIcon} size={18} />
                  <Text variant="caption" tone="muted" className="uppercase tracking-wide">
                    {formatShortDate(bill.date)}
                  </Text>
                </View>
                <Pressable
                  onPress={handleEdit}
                  hitSlop={6}
                  className="flex-row items-center gap-1 rounded-full bg-card/70 px-3 py-1.5 active:opacity-70"
                >
                  <Pencil size={13} color={themeColors.text} />
                  <Text variant="caption" className="font-medium">
                    {I18n.t('common.edit')}
                  </Text>
                </Pressable>
              </View>
              <Text variant="heading" className="mt-1 text-3xl">
                {formatNative(bill.totalNative, bill.currency)}
              </Text>
              <Text variant="caption" tone="muted" className="mt-1">
                {bill.peopleCount === 1
                  ? I18n.t('transactions.settleUp.people_one')
                  : I18n.t('transactions.settleUp.people_other', { count: bill.peopleCount })}
              </Text>
            </View>

            <View className="mt-4 gap-2">
              {personGroups.map((group) => {
                const account = group.paybackAccountId
                  ? getAccountById(group.paybackAccountId)
                  : null;
                return (
                  <View
                    key={group.key}
                    className="rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5"
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
                        <Text variant="bodyStrong">{personInitial(group.name)}</Text>
                      </View>
                      <View className="flex-1">
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {group.name ?? I18n.t('transactions.settleUp.someone')}
                        </Text>
                        {/* A person's items (their own lines + any shared line),
                            each with a shared badge when applicable. */}
                        {group.items.length > 0 ? (
                          <View className="mt-1 gap-0.5">
                            {group.items.map((item) => (
                              <View key={item.key} className="flex-row items-center gap-1.5">
                                {item.shared ? <SharedBadge /> : null}
                                {item.name ? (
                                  <Text
                                    variant="caption"
                                    tone="muted"
                                    numberOfLines={1}
                                    className="shrink"
                                  >
                                    {item.name}
                                  </Text>
                                ) : null}
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                      <Text variant="bodyStrong">{formatNative(group.amount, group.currency)}</Text>
                    </View>

                    <View className="my-3 h-px bg-border/15" />

                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          setPickerForGroupKey(group.key);
                        }}
                        className="min-w-0 flex-shrink flex-row items-center gap-1.5 rounded-full bg-secondary/50 py-1.5 pl-2 pr-2.5 active:opacity-70"
                      >
                        {account ? (
                          <AccountLogo logoId={account.logoId} type={account.type} size={16} />
                        ) : null}
                        <Text
                          variant="caption"
                          tone="muted"
                          numberOfLines={1}
                          className="max-w-[150px]"
                        >
                          {account?.name ?? I18n.t('common.no_account')}
                        </Text>
                        <ChevronDown size={12} color={themeColors.textMuted} />
                      </Pressable>
                      <View className="flex-1" />
                      <Pressable
                        onPress={() => handleDelete(group.splitIds)}
                        hitSlop={8}
                        className="h-8 w-8 items-center justify-center rounded-full bg-destructive/10 active:opacity-70"
                      >
                        <Trash2 size={15} color={themeColors.error} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleMarkPaid(group.splitIds)}
                        hitSlop={8}
                        className="flex-row items-center gap-1 rounded-full bg-success/15 px-3.5 py-2 active:opacity-70"
                      >
                        <Check size={14} color={themeColors.success} />
                        <Text variant="caption" className="text-success font-medium">
                          {I18n.t('transactions.editor.split.mark_paid')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View className="px-5 pb-8 pt-2">
            <Button onPress={handleShare} className="w-full gap-2">
              <Send size={18} color="#fff" />
              <Text>{I18n.t('transactions.settleUp.share_receipt')}</Text>
            </Button>
          </View>

          <AccountPickerSheet
            visible={pickerForGroupKey !== null}
            onClose={() => setPickerForGroupKey(null)}
            accounts={accounts}
            accountGroups={accountGroups}
            selectedAccountId={pickerGroup?.paybackAccountId ?? null}
            onSelect={(accountId) => {
              // Apply the payback account to every split in the person's group.
              pickerGroup?.splitIds.forEach((id) => updateSplitPaybackAccount(id, accountId));
              setPickerForGroupKey(null);
            }}
          />

          <SplitReceiptShareModal
            visible={shareVisible}
            onClose={() => setShareVisible(false)}
            content={receiptContent}
            itemCount={bill.splitCount}
            onSetupQr={onOpenSettings}
          />
        </>
      ) : null}
    </SettingsPageLayout>
  );
}
