import { ChevronRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AccountLogo, AccountPickerSheet, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { isPayableAccount } from '../lib/binding';

interface PaysFromControlProps {
  accountId: string | null;
  onChange: (accountId: string) => void;
}

export function PaysFromControl({ accountId, onChange }: PaysFromControlProps) {
  const { accounts, accountGroups } = useApp();
  const colors = useThemeColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  const payable = useMemo(() => accounts.filter(isPayableAccount), [accounts]);
  const account = payable.find((item) => item.id === accountId) ?? null;
  return (
    <View>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          setPickerOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('transactions.editor.choose_account')}
        className="flex-row items-center gap-3 rounded-xl border border-border/60 bg-secondary/40 px-3 py-3"
      >
        {account ? <AccountLogo logoId={account.logoId} type={account.type} size={24} /> : null}
        <Text className="flex-1" numberOfLines={1}>
          {account?.name ?? I18n.t('transactions.editor.choose_account')}
        </Text>
        <ChevronRight size={18} color={colors.textMuted} />
      </Pressable>
      <AccountPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        accounts={payable}
        accountGroups={accountGroups}
        selectedAccountId={accountId}
        onSelect={(id) => {
          setPickerOpen(false);
          onChange(id);
        }}
      />
    </View>
  );
}
