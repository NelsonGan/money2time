import { ChevronDown } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup } from '~/types';

interface AccountPanelBaseProps {
  accounts: Account[];
  accountGroups: AccountGroup[];
  disabledId?: string | null;
  disableGrouping?: boolean;
  onBackgroundPress?: () => void;
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
const GRID_DIVIDER_WIDTH = 1;
const ACCOUNT_PANEL_CONTENT_STYLE = { paddingBottom: 16, flexGrow: 1 } as const;

const styles = StyleSheet.create({
  disabledAccount: {
    opacity: 0.45,
  },
  chevronCollapsed: {
    transform: [{ rotate: '0deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  gridRow: {
    flexDirection: 'row',
    minHeight: 58,
  },
  gridCell: {
    flex: 1,
    minHeight: 58,
  },
  gridCellButton: {
    flex: 1,
    minHeight: 58,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    position: 'relative',
  },
  gridLabel: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  cornerRight: {
    position: 'absolute',
    right: 6,
    top: 6,
  },
});

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
  const { accounts, accountGroups, disabledId, disableGrouping = false, onBackgroundPress } = props;
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
  const ownerGroupKeyByAccountId = useMemo(() => {
    const ownerByAccountId = new Map<string, string>();
    grouped.forEach((group) => {
      group.accounts.forEach((account) => {
        ownerByAccountId.set(account.id, group.key);
      });
    });
    return ownerByAccountId;
  }, [grouped]);
  const selectedGroupKeySet = useMemo(() => {
    const groupKeys = new Set<string>();
    if (isMultiSelect) {
      if (selectedIdSet.size === 0) return groupKeys;
      grouped.forEach((group) => {
        if (group.accounts.some((account) => selectedIdSet.has(account.id))) {
          groupKeys.add(group.key);
        }
      });
      return groupKeys;
    }

    if (!selectedId) return groupKeys;
    const ownerGroupKey = ownerGroupKeyByAccountId.get(selectedId);
    if (ownerGroupKey) {
      groupKeys.add(ownerGroupKey);
    }
    return groupKeys;
  }, [grouped, isMultiSelect, ownerGroupKeyByAccountId, selectedId, selectedIdSet]);

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
    const ownerGroupKey = ownerGroupKeyByAccountId.get(target);
    if (ownerGroupKey) setExpandedGroupKey(ownerGroupKey);
  }, [isMultiSelect, ownerGroupKeyByAccountId, selectedId, selectedIds]);

  // If grouping is disabled or only one group, show accounts directly.
  const showGroupTiles = !disableGrouping && grouped.length > 1;
  const groupRows = useMemo(() => chunk(grouped, COLS), [grouped]);
  const gridDividerColor = themeColors.border;

  const renderGridRow = <T,>(
    rowKey: string,
    items: T[],
    _rowIndex: number,
    renderCell: (item: T) => React.ReactNode,
    fillColor?: string,
  ) => {
    const populatedColumnCount = items.length;
    const showFill = !!fillColor;
    const cellBg = fillColor ?? themeColors.surface;

    return (
      <View key={rowKey} style={styles.gridRow}>
        {Array.from({ length: COLS }, (_, columnIndex) => {
          const item = items[columnIndex];
          const hasItem = item !== undefined;
          const hasBg = hasItem || showFill;
          const shouldShowRightBorder = showFill
            ? hasBg && columnIndex < COLS - 1
            : hasItem &&
              (columnIndex < populatedColumnCount - 1 || populatedColumnCount < COLS);

          return (
            <View
              key={`${rowKey}-${columnIndex}`}
              style={[
                styles.gridCell,
                hasBg ? { backgroundColor: cellBg } : null,
                hasBg
                  ? { borderBottomWidth: GRID_DIVIDER_WIDTH, borderBottomColor: gridDividerColor }
                  : null,
                shouldShowRightBorder
                  ? { borderRightWidth: GRID_DIVIDER_WIDTH, borderRightColor: gridDividerColor }
                  : null,
              ]}
            >
              {hasItem ? renderCell(item) : null}
            </View>
          );
        })}
      </View>
    );
  };

  const renderAccountCell = (account: Account) => {
    const isSelected = isAccountSelected(account.id);
    const isDisabled = disabledId === account.id;

    return (
      <Pressable
        onPress={() => {
          if (isDisabled) return;
          handleAccountPress(account.id);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected, disabled: isDisabled || undefined }}
        style={[
          styles.gridCellButton,
          {
            backgroundColor: isSelected
              ? themeColors.primarySoft
              : isDisabled
                ? themeColors.surfaceMuted
                : 'transparent',
          },
          isDisabled ? styles.disabledAccount : null,
        ]}
      >
        <Text
          variant="caption"
          numberOfLines={2}
          style={[
            styles.gridLabel,
            { color: isSelected ? themeColors.primary : isDisabled ? themeColors.textMuted : themeColors.text },
          ]}
        >
          {account.name}
        </Text>
      </Pressable>
    );
  };

  if (!showGroupTiles) {
    const allAccounts = grouped.length === 1 ? grouped[0].accounts : accounts;
    const accountRows = chunk(allAccounts, COLS);

    return (
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ACCOUNT_PANEL_CONTENT_STYLE}
      >
        {accountRows.map((row, rowIndex) =>
          renderGridRow(`accounts-${rowIndex}`, row, rowIndex, renderAccountCell),
        )}
        <Pressable accessible={false} onPress={onBackgroundPress} style={{ flex: 1 }} />
      </ScrollView>
    );
  }

  // Multiple groups: show group tiles with expand/collapse
  const groupedRenderRows = groupRows.flatMap((row, rowIndex) => {
    const rows: { key: string; kind: 'group' | 'account'; items: GroupSection[] | Account[] }[] = [
      { key: `group-${rowIndex}`, kind: 'group', items: row },
    ];
    const expandedInRow = expandedGroupKey ? row.find((group) => group.key === expandedGroupKey) : null;
    if (!expandedInRow) return rows;

    chunk(expandedInRow.accounts, COLS).forEach((accountRow, accountRowIndex) => {
      rows.push({
        key: `group-${expandedInRow.key}-accounts-${accountRowIndex}`,
        kind: 'account',
        items: accountRow,
      });
    });
    return rows;
  });

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={ACCOUNT_PANEL_CONTENT_STYLE}
    >
      {groupedRenderRows.map((row, rowIndex) =>
        row.kind === 'group'
          ? renderGridRow(row.key, row.items as GroupSection[], rowIndex, (group) => {
              const hasSelectedAccount = selectedGroupKeySet.has(group.key);
              const isExpanded = expandedGroupKey === group.key;

              return (
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setExpandedGroupKey((previous) => (previous === group.key ? null : group.key));
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded, selected: hasSelectedAccount }}
                  style={[
                    styles.gridCellButton,
                    {
                      backgroundColor: hasSelectedAccount
                        ? themeColors.primarySoft
                        : isExpanded
                          ? themeColors.surfaceMuted
                          : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.cornerRight}>
                    <ChevronDown
                      size={13}
                      color={hasSelectedAccount || isExpanded ? themeColors.primary : themeColors.textMuted}
                      style={isExpanded ? styles.chevronExpanded : styles.chevronCollapsed}
                    />
                  </View>
                  <Text
                    variant="caption"
                    numberOfLines={2}
                    style={[
                      styles.gridLabel,
                      {
                        color:
                          hasSelectedAccount || isExpanded ? themeColors.primary : themeColors.text,
                      },
                    ]}
                  >
                    {group.label}
                  </Text>
                </Pressable>
              );
            })
          : renderGridRow(
              row.key,
              row.items as Account[],
              rowIndex,
              renderAccountCell,
              themeColors.surfaceMuted,
            ),
      )}
      <Pressable accessible={false} onPress={onBackgroundPress} style={{ flex: 1 }} />
    </ScrollView>
  );
}
