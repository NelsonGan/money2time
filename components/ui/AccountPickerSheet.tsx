import { Check, X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account, AccountGroup } from '~/types';
import { cn } from '~/utils';

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

export type AccountPickerSheetProps =
  | AccountPickerSheetSingleProps
  | AccountPickerSheetMultiProps;

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

export function AccountPickerSheet(props: AccountPickerSheetProps) {
  const { visible, onClose, accounts, accountGroups, disabledId, overlay = false } = props;
  const isMultiSelect = 'selectedIds' in props && props.selectedIds !== undefined;
  const selectedIdSet = useMemo(
    () => new Set(isMultiSelect ? props.selectedIds : []),
    [isMultiSelect, props.selectedIds],
  );

  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

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
    for (const account of accounts) {
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
        label: out.length > 0 ? I18n.t('common.other') : '',
        accounts: ungrouped,
      });
    }
    return out;
  }, [accounts, accountGroups]);

  const sheetContent = (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
        <View
          className="bg-card rounded-t-[28px] flex-1"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          <View className="px-5 pt-5 pb-5 flex-row items-center gap-2">
            <Text variant="subheading" numberOfLines={1} className="shrink">
              {I18n.t('accounts.title')}
            </Text>
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
          <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
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
                    return (
                      <View key={acct.id} className="w-1/2 px-1 mb-2">
                        <Pressable
                          onPress={() => {
                            if (isDisabled) return;
                            handleAccountPress(acct.id);
                          }}
                          disabled={isDisabled}
                          style={({ pressed }) => ({
                            opacity: isDisabled ? 0.45 : pressed ? 0.6 : 1,
                          })}
                          className={cn(
                            'rounded-2xl px-3 py-3 flex-row items-center justify-between gap-2',
                            isSelected
                              ? 'bg-primary/15 border border-primary/30'
                              : isDisabled
                                ? 'bg-secondary/20 border border-transparent'
                                : 'bg-secondary/40 border border-transparent',
                          )}
                        >
                          <Text
                            variant="body"
                            numberOfLines={1}
                            className={cn(
                              'flex-1',
                              isSelected && 'text-primary font-medium',
                              isDisabled && !isSelected && 'text-muted-foreground',
                            )}
                          >
                            {acct.name}
                          </Text>
                          {isSelected ? (
                            <Check size={14} color={themeColors.primary} />
                          ) : null}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Pressable>
  );

  if (overlay) {
    if (!visible) return null;
    return <View style={styles.absoluteFill}>{sheetContent}</View>;
  }

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {sheetContent}
    </ThemeModal>
  );
}
