import { Check, Eye, EyeOff, X } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo } from '~/components/ui/AccountLogo';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useApp, useTransactions } from '~/context/AppContext';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup } from '~/types';
import { cn } from '~/utils';
import { getNetAssetContribution } from '~/utils/accountBalances';
import { formatAmount } from '~/utils/formatters';

interface AccountPickerSheetBaseProps {
  visible: boolean;
  onClose: () => void;
  accounts: Account[];
  accountGroups: AccountGroup[];
  disabledId?: string | null;
  /** Render as an absolute-fill View instead of a native Modal (for use inside another modal). */
  overlay?: boolean;
}

interface AccountPickerSheetSingleProps extends AccountPickerSheetBaseProps {
  selectedAccountId: string | null;
  onSelect: (accountId: string) => void;
  selectedIds?: never;
  onToggleSelect?: never;
}

interface AccountPickerSheetMultiProps extends AccountPickerSheetBaseProps {
  selectedIds: string[];
  onToggleSelect: (accountId: string) => void;
  /** Optional handler — when provided, renders a "Clear" button in the header while there are selections. */
  onClear?: () => void;
  selectedAccountId?: never;
  onSelect?: never;
}

export type AccountPickerSheetProps = AccountPickerSheetSingleProps | AccountPickerSheetMultiProps;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '75%',
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
});

/**
 * Each account's balance, formatted the way the Accounts tab shows it: in the
 * account's own currency, or as hours in time mode. Read in the sheet's body,
 * which only mounts while the sheet is open, so the many screens that keep a
 * picker mounted do not re-render on every transaction write.
 */
function useAccountBalanceLabel(enabled: boolean) {
  const { settings, currentMonthWage } = useApp();
  const { accountBalances } = useTransactions();
  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;
  const balanceById = useMemo(
    () => new Map(accountBalances.map((entry) => [entry.accountId, entry.balance])),
    [accountBalances],
  );
  return useCallback(
    (account: Account): { text: string; negative: boolean } | null => {
      if (!enabled) return null;
      // An account with no rows yet has no balance entry; it holds its
      // starting balance.
      const balance = balanceById.get(account.id) ?? account.startingBalance;
      return {
        text: formatAmount(balance, settings, { trueHourlyRate, currencyCode: account.currency }),
        // For a card or loan a positive balance is money owed, so "against
        // you" is the net-asset sign, not the raw one.
        negative: getNetAssetContribution(account.type, balance) < 0,
      };
    },
    [balanceById, enabled, settings, trueHourlyRate],
  );
}

interface AccountPickerSectionsProps {
  sections: { key: string; label: string; accounts: Account[] }[];
  showBalances: boolean;
  /** Space below the last row, so it can scroll clear of the home indicator. */
  bottomInset: number;
  disabledId?: string | null;
  isAccountSelected: (accountId: string) => boolean;
  onPressAccount: (accountId: string) => void;
}

function AccountPickerSections({
  sections,
  showBalances,
  bottomInset,
  disabledId,
  isAccountSelected,
  onPressAccount,
}: AccountPickerSectionsProps) {
  const themeColors = useThemeColors();
  const balanceLabel = useAccountBalanceLabel(showBalances);

  return (
    <ScrollView
      className="flex-1 px-4"
      contentContainerStyle={{ paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
    >
      {sections.map((section, sectionIndex) => (
        <View key={section.key} className={cn(sectionIndex > 0 && 'mt-4')}>
          {section.label ? (
            <Text variant="caption" tone="muted" className="mb-2 px-1 uppercase">
              {section.label}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap -mx-1">
            {section.accounts.map((acct) => {
              const isSelected = isAccountSelected(acct.id);
              const isDisabled = disabledId === acct.id;
              const balance = balanceLabel(acct);
              return (
                <View key={acct.id} className="w-1/2 px-1 mb-2">
                  <Pressable
                    onPress={() => {
                      if (isDisabled) return;
                      onPressAccount(acct.id);
                    }}
                    disabled={isDisabled}
                    style={({ pressed }) => ({
                      opacity: isDisabled ? 0.45 : pressed ? 0.6 : 1,
                    })}
                    className={cn(
                      'rounded-2xl px-3 py-3 flex-row items-center gap-2',
                      isSelected
                        ? 'bg-primary/15 border border-primary/30'
                        : isDisabled
                          ? 'bg-secondary/20 border border-transparent'
                          : 'bg-secondary/40 border border-transparent',
                    )}
                  >
                    <AccountLogo
                      logoId={acct.logoId}
                      type={acct.type}
                      goalEmoji={acct.goalEmoji}
                      size={28}
                    />
                    <View className="flex-1">
                      <Text
                        variant="body"
                        numberOfLines={1}
                        className={cn(
                          isSelected && 'text-primary font-medium',
                          isDisabled && !isSelected && 'text-muted-foreground',
                        )}
                      >
                        {acct.name}
                      </Text>
                      {balance ? (
                        <Text
                          variant="caption"
                          numberOfLines={1}
                          className={
                            balance.negative ? 'text-destructive' : 'text-muted-foreground'
                          }
                        >
                          {balance.text}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? <Check size={14} color={themeColors.primary} /> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export function AccountPickerSheet(props: AccountPickerSheetProps) {
  const sheetColumnStyle = useSheetColumnStyle();
  const { visible, onClose, accounts, accountGroups, disabledId, overlay = false } = props;
  const isMultiSelect = 'selectedIds' in props && props.selectedIds !== undefined;
  const selectedIdSet = useMemo(
    () => new Set(isMultiSelect ? props.selectedIds : []),
    [isMultiSelect, props.selectedIds],
  );

  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();
  const showBalances = settings.showAccountPickerBalances;
  const handleToggleBalances = () => {
    void triggerHaptic('selection');
    updateSettings({ showAccountPickerBalances: !showBalances });
  };
  const singleSelectedId = isMultiSelect ? null : props.selectedAccountId;

  const isAccountSelected = (accountId: string) =>
    isMultiSelect ? selectedIdSet.has(accountId) : props.selectedAccountId === accountId;

  const handleAccountPress = (accountId: string) => {
    void triggerHaptic('selection');
    if (isMultiSelect) {
      props.onToggleSelect!(accountId);
    } else {
      props.onSelect!(accountId);
    }
  };

  const sections = useMemo(() => {
    type Section = { key: string; label: string; accounts: Account[] };
    const groupNames = new Set(accountGroups.map((g) => g.name));
    const buckets = new Map<string, Account[]>();
    const goals: Account[] = [];
    for (const account of accounts) {
      const isSelected = account.id === singleSelectedId || selectedIdSet.has(account.id);
      if (account.type === 'goal') {
        // Archived goals drop out (a currently selected one stays visible);
        // active goals sit under their own pinned section, never a bank group.
        if (account.goalArchivedAt != null && !isSelected) continue;
        goals.push(account);
        continue;
      }
      // A settled, archived loan is history; it should not clutter the picker
      // (a currently selected one stays visible, as with goals).
      if (account.type === 'loan' && account.loanArchivedAt != null && !isSelected) continue;
      const key = account.accountGroup?.trim() || '__ungrouped__';
      const list = buckets.get(key) ?? [];
      list.push(account);
      buckets.set(key, list);
    }
    const out: Section[] = [];
    for (const group of accountGroups) {
      const list = buckets.get(group.name);
      if (list && list.length > 0) {
        out.push({ key: group.id, label: group.name, accounts: list });
      }
    }
    for (const [key, list] of buckets) {
      if (key === '__ungrouped__') continue;
      if (groupNames.has(key)) continue;
      out.push({ key, label: key, accounts: list });
    }
    const ungrouped = buckets.get('__ungrouped__');
    if (ungrouped && ungrouped.length > 0) {
      out.push({
        key: '__ungrouped__',
        label: out.length > 0 ? String(I18n.t('common.ungrouped')) : '',
        accounts: ungrouped,
      });
    }
    if (goals.length > 0) {
      out.push({
        key: '__goals__',
        label: String(I18n.t('goals.picker_group')),
        accounts: goals,
      });
    }
    return out;
  }, [accounts, accountGroups, selectedIdSet, singleSelectedId]);

  // A hidden overlay renders nothing, so don't build its rows either. Hosts keep
  // the picker mounted and re-render it with their own state (the quick-add
  // sheet does as it closes on save), and with a few dozen accounts building
  // that tree only to discard it was a real slice of the save.
  if (overlay && !visible) return null;

  const sheetContent = (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable onPress={(e) => e.stopPropagation()} style={[styles.sheet, sheetColumnStyle]}>
        {/* The bottom inset pads the list rather than the card, so rows run
            to the screen edge instead of stopping mid-tile above an empty
            band, and the last row still scrolls clear of the home indicator. */}
        <View className="bg-card rounded-t-[28px] flex-1">
          <View className="px-5 pt-5 pb-5 flex-row items-center gap-2">
            <Text variant="subheading" numberOfLines={1} className="shrink">
              {I18n.t('accounts.title')}
            </Text>
            {/* Hides the balances outright rather than masking them, so the
                tiles go back to one line. The choice is saved for every
                picker in the app. */}
            <Pressable
              onPress={handleToggleBalances}
              accessibilityRole="button"
              accessibilityLabel={I18n.t(
                showBalances ? 'accounts.hide_balances' : 'accounts.show_balances',
              )}
              hitSlop={8}
              className="h-8 w-8 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
            >
              {showBalances ? (
                <Eye size={16} color={themeColors.textMuted} />
              ) : (
                <EyeOff size={16} color={themeColors.textMuted} />
              )}
            </Pressable>
            {isMultiSelect && props.onClear && selectedIdSet.size > 0 ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  props.onClear!();
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.clear')}
                className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 active:opacity-85"
              >
                <Text variant="caption" className="text-primary font-medium">
                  {I18n.t('common.clear')}
                </Text>
              </Pressable>
            ) : null}
            <View className="flex-1" />
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              hitSlop={8}
              className="h-9 w-9 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
            >
              <X size={18} color={themeColors.textMuted} />
            </Pressable>
          </View>
          <AccountPickerSections
            sections={sections}
            showBalances={showBalances}
            bottomInset={Math.max(insets.bottom, 16) + 8}
            disabledId={disabledId}
            isAccountSelected={isAccountSelected}
            onPressAccount={handleAccountPress}
          />
        </View>
      </Pressable>
    </Pressable>
  );

  if (overlay) {
    return <View style={styles.absoluteFill}>{sheetContent}</View>;
  }

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {sheetContent}
    </ThemeModal>
  );
}
