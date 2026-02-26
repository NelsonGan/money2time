import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';

import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import type { Account, AccountGroup } from '~/types';
import { I18n } from '~/lib/i18n';

interface AccountPanelBaseProps {
  accounts: Account[];
  accountGroups: AccountGroup[];
  disabledId?: string | null;
}

interface AccountPanelSingleSelectProps extends AccountPanelBaseProps {
  selectedId: string | null;
  onSelect: (accountId: string) => void;
  selectedIds?: never;
  onToggleSelect?: never;
}

interface AccountPanelMultiSelectProps extends AccountPanelBaseProps {
  selectedIds: string[];
  onToggleSelect: (accountId: string) => void;
  selectedId?: never;
  onSelect?: never;
}

type AccountPanelProps = AccountPanelSingleSelectProps | AccountPanelMultiSelectProps;

const COLS = 3;

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

interface GroupSection {
  key: string;
  label: string;
  accounts: Account[];
}

export function AccountPanel(props: AccountPanelProps) {
  const { accounts, accountGroups, disabledId } = props;
  const themeColors = useThemeColors();
  const isMultiSelect = 'selectedIds' in props;
  const selectedId = isMultiSelect ? null : props.selectedId;
  const selectedIds = isMultiSelect ? props.selectedIds : null;
  const selectedIdSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const groupNames = new Set(accountGroups.map((g) => g.name));
    const sections: GroupSection[] = [];
    const buckets = new Map<string, Account[]>();

    for (const account of accounts) {
      const key = account.accountGroup?.trim() || '__ungrouped__';
      const list = buckets.get(key) ?? [];
      list.push(account);
      buckets.set(key, list);
    }

    for (const group of accountGroups) {
      const list = buckets.get(group.name);
      if (list && list.length > 0) {
        sections.push({ key: group.id, label: group.name, accounts: list });
      }
    }

    for (const [key, list] of buckets) {
      if (key === '__ungrouped__') continue;
      if (groupNames.has(key)) continue;
      sections.push({ key, label: key, accounts: list });
    }

    const ungrouped = buckets.get('__ungrouped__');
    if (ungrouped && ungrouped.length > 0) {
      sections.push({
        key: '__ungrouped__',
        label: sections.length > 0 ? I18n.t('common.other') : '',
        accounts: ungrouped,
      });
    }

    return sections;
  }, [accounts, accountGroups]);

  const isAccountSelected = (accountId: string) =>
    isMultiSelect ? selectedIdSet.has(accountId) : selectedId === accountId;

  const handleAccountPress = (accountId: string) => {
    void triggerHaptic('selection');
    if (isMultiSelect) {
      props.onToggleSelect?.(accountId);
    } else {
      props.onSelect?.(accountId);
    }
  };

  // Auto-expand the group containing the selected account
  useEffect(() => {
    const target = isMultiSelect ? (selectedIds?.[0] ?? null) : selectedId;
    if (!target) return;
    const ownerGroup = grouped.find((g) =>
      g.accounts.some((a) => a.id === target),
    );
    if (ownerGroup) setExpandedGroupKey(ownerGroup.key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If only one group, show accounts directly (no group tiles)
  const showGroupTiles = grouped.length > 1;

  if (!showGroupTiles) {
    const allAccounts = grouped.length === 1 ? grouped[0].accounts : accounts;
    const accountRows = chunk(allAccounts, COLS);

    return (
      <ScrollView
        className="flex-1 px-4 pt-2"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View className="gap-3">
          {accountRows.map((row, rowIndex) => (
            <View key={rowIndex} className="flex-row gap-2">
              {row.map((account) => {
                const isSelected = isAccountSelected(account.id);
                const isDisabled = disabledId === account.id;
                return (
                  <View key={account.id} className="flex-1">
                    <Pressable
                      onPress={() => {
                        if (isDisabled) return;
                        handleAccountPress(account.id);
                      }}
                      className={cn(
                        'rounded-xl border px-2.5 py-2.5 items-center justify-center',
                        isSelected
                          ? 'bg-primary/10 border-primary/45'
                          : isDisabled
                            ? 'bg-secondary/40 border-border/20'
                            : 'bg-card border-border/30',
                      )}
                      style={isDisabled ? { opacity: 0.4 } : undefined}
                    >
                      <Text
                        variant="label"
                        numberOfLines={2}
                        className={cn(
                          'text-center',
                          isSelected
                            ? 'text-primary'
                            : isDisabled
                              ? 'text-muted-foreground'
                              : 'text-foreground',
                        )}
                      >
                        {account.name}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {row.length < COLS &&
                Array.from({ length: COLS - row.length }, (_, i) => (
                  <View key={`pad-${i}`} className="flex-1" />
                ))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // Multiple groups: show group tiles with expand/collapse
  const groupRows = chunk(grouped, COLS);

  return (
    <ScrollView
      className="flex-1 px-4 pt-2"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 16 }}
    >
      <View className="gap-2">
        {groupRows.map((row, rowIndex) => {
          const expandedInRow = expandedGroupKey
            ? row.find((g) => g.key === expandedGroupKey)
            : null;
          const expandedAccounts = expandedInRow ? expandedInRow.accounts : [];
          const accountRows = expandedAccounts.length > 0 ? chunk(expandedAccounts, COLS) : [];

          return (
            <React.Fragment key={rowIndex}>
              {/* Group tiles row */}
              <View className="flex-row gap-2">
                {row.map((group) => {
                  const hasSelectedAccount = group.accounts.some((a) =>
                    isAccountSelected(a.id),
                  );
                  const isExpanded = expandedGroupKey === group.key;

                  return (
                    <View key={group.key} className="flex-1">
                      <Pressable
                        onPress={() => {
                          void triggerHaptic('selection');
                          setExpandedGroupKey((prev) =>
                            prev === group.key ? null : group.key,
                          );
                        }}
                        className={cn(
                          'rounded-xl border px-2.5 py-2.5 flex-row items-center',
                          hasSelectedAccount
                            ? 'bg-primary/10 border-primary/45'
                            : isExpanded
                              ? 'bg-primary/5 border-primary/30'
                              : 'bg-card border-border/30',
                        )}
                      >
                        <Text
                          variant="caption"
                          numberOfLines={1}
                          className={cn(
                            'flex-1',
                            hasSelectedAccount || isExpanded
                              ? 'text-primary'
                              : 'text-foreground',
                          )}
                        >
                          {group.label}
                        </Text>
                        <ChevronDown
                          size={13}
                          color={
                            hasSelectedAccount || isExpanded
                              ? themeColors.primary
                              : themeColors.textMuted
                          }
                          style={{
                            transform: [{ rotate: isExpanded ? '180deg' : '0deg' }],
                          }}
                        />
                      </Pressable>
                    </View>
                  );
                })}
                {row.length < COLS &&
                  Array.from({ length: COLS - row.length }, (_, i) => (
                    <View key={`pad-${i}`} className="flex-1" />
                  ))}
              </View>

              {/* Expanded accounts - full width below row */}
              {accountRows.map((accRow, accRowIndex) => (
                <View key={`acc-${accRowIndex}`} className="flex-row gap-2">
                  {accRow.map((account) => {
                    const isSelected = isAccountSelected(account.id);
                    const isDisabled = disabledId === account.id;
                    return (
                      <View key={account.id} className="flex-1">
                        <Pressable
                          onPress={() => {
                            if (isDisabled) return;
                            handleAccountPress(account.id);
                          }}
                          className={cn(
                            'rounded-xl border px-2.5 py-2 items-center justify-center',
                            isSelected
                              ? 'bg-primary/10 border-primary/40'
                              : isDisabled
                                ? 'bg-secondary/40 border-border/20'
                                : 'bg-secondary/50 border-border/20',
                          )}
                          style={isDisabled ? { opacity: 0.4 } : undefined}
                        >
                          <Text
                            variant="label"
                            numberOfLines={2}
                            className={cn(
                              'text-center',
                              isSelected
                                ? 'text-primary'
                                : isDisabled
                                  ? 'text-muted-foreground'
                                  : 'text-foreground',
                            )}
                          >
                            {account.name}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {accRow.length < COLS &&
                    Array.from({ length: COLS - accRow.length }, (_, i) => (
                      <View key={`apad-${i}`} className="flex-1" />
                    ))}
                </View>
              ))}
            </React.Fragment>
          );
        })}
      </View>
    </ScrollView>
  );
}
