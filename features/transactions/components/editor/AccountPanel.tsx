import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '~/components/ui/text';
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

export function AccountPanel(props: AccountPanelProps) {
  const { accounts, accountGroups, disabledId } = props;
  const isMultiSelect = 'selectedIds' in props;
  const selectedId = isMultiSelect ? null : props.selectedId;
  const selectedIds = isMultiSelect ? props.selectedIds : null;
  const selectedIdSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  const grouped = useMemo(() => {
    // account.accountGroup stores the group NAME, not ID
    const groupNames = new Set(accountGroups.map((g) => g.name));
    const sections: { key: string; label: string; accounts: Account[] }[] = [];
    const buckets = new Map<string, Account[]>();

    for (const account of accounts) {
      const key = account.accountGroup?.trim() || '__ungrouped__';
      const list = buckets.get(key) ?? [];
      list.push(account);
      buckets.set(key, list);
    }

    // Named groups first (in accountGroups sort order)
    for (const group of accountGroups) {
      const list = buckets.get(group.name);
      if (list && list.length > 0) {
        sections.push({ key: group.id, label: group.name, accounts: list });
      }
    }

    // Any accounts with a group name that doesn't match a known group
    for (const [key, list] of buckets) {
      if (key === '__ungrouped__') continue;
      if (groupNames.has(key)) continue;
      sections.push({ key, label: key, accounts: list });
    }

    // Ungrouped accounts last
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

  const showHeaders = grouped.length > 1 || (grouped.length === 1 && grouped[0].label !== '');

  return (
    <ScrollView
      className="flex-1 px-4 pt-2"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 16 }}
    >
      <View className="gap-4">
        {grouped.map((group) => (
          <View key={group.key}>
            {showHeaders && group.label ? (
              <Text variant="label" tone="muted" className="mb-1.5 px-1">
                {group.label}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {group.accounts.map((account) => {
                const isSelected = isMultiSelect
                  ? selectedIdSet.has(account.id)
                  : selectedId === account.id;
                const isDisabled = disabledId === account.id;

                return (
                  <View key={account.id} className="w-[31.5%]">
                    <Pressable
                      onPress={() => {
                        if (isDisabled) return;
                        void triggerHaptic('selection');
                        if (isMultiSelect) {
                          props.onToggleSelect?.(account.id);
                          return;
                        }
                        props.onSelect?.(account.id);
                      }}
                      className={cn(
                        'rounded-xl border px-2.5 py-2.5 flex-row items-center justify-center',
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
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
