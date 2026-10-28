import { ChevronDown } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { ledgerDisplayName, ledgerIcon } from '../lib/ledgerDisplay';

/** The open ledger at the top of Settings; a tap opens the switcher. */
export function LedgerSwitcherCard({ onPress }: { onPress: () => void }) {
  const { activeLedger } = useApp();
  const themeColors = useThemeColors();
  const name = ledgerDisplayName(activeLedger);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={I18n.t('ledgers.switcher_label', { name })}
      testID="ledger-switcher-card"
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className="flex-row items-center gap-3 rounded-3xl border border-border/30 bg-card px-3 py-2.5 shadow-soft active:scale-[0.98] active:opacity-90"
    >
      <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/60">
        <CategoryEmoji icon={ledgerIcon(activeLedger)} size={22} />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="label" tone="muted" numberOfLines={1}>
          {I18n.t('ledgers.label')}
        </Text>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View className="h-8 w-8 items-center justify-center rounded-full bg-secondary/50">
        <ChevronDown size={18} color={themeColors.text} />
      </View>
    </Pressable>
  );
}
