import { Image } from 'expo-image';
import { Eye, ImageOff, Receipt } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text, TimeValueInline } from '~/components/ui';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getReceiptUri } from '~/services/userAssets';
import type { TransactionWithRelations, UserSettings } from '~/types';
import { formatAmount, formatHours, formatShortDate } from '~/utils/formatters';

interface ReceiptCardProps {
  transaction: TransactionWithRelations;
  /** Value to render as the amount, already resolved for the active display mode. */
  displayValue: number;
  settings: UserSettings;
  onViewTransaction: (transactionId: string) => void;
  onViewReceipt: (fileUri: string) => void;
}

export const ReceiptCard = memo(function ReceiptCard({
  transaction,
  displayValue,
  settings,
  onViewTransaction,
  onViewReceipt,
}: ReceiptCardProps) {
  const themeColors = useThemeColors();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.98 });

  const receiptFileUri = useMemo(
    () => getReceiptUri(transaction.receiptUri),
    [transaction.receiptUri],
  );
  const locale = I18n.locale ?? 'en';
  const isTimeMode = settings.displayMode === 'time';
  const isIncome = transaction.type === 'income';

  const title =
    transaction.note?.trim() || transaction.categoryName || I18n.t('receipts.title') || '';

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onViewTransaction(transaction.id);
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Animated.View
        style={animatedStyle}
        className="rounded-2xl border border-border/40 bg-card p-3 shadow-soft"
      >
        <View className="flex-row gap-3">
          {/* Receipt thumbnail (or a placeholder when the file is missing). */}
          {receiptFileUri ? (
            <Image
              source={{ uri: receiptFileUri }}
              style={{ width: 72, height: 72, borderRadius: 12 }}
              contentFit="cover"
              transition={120}
            />
          ) : (
            <View
              className="items-center justify-center rounded-xl bg-secondary/50"
              style={{ width: 72, height: 72 }}
            >
              <ImageOff size={22} color={themeColors.textMuted} />
            </View>
          )}

          {/* Date, note and amount. */}
          <View className="flex-1 justify-center">
            <Text variant="label" tone="muted" numberOfLines={1}>
              {formatShortDate(transaction.date, locale)}
            </Text>
            <Text variant="bodyStrong" numberOfLines={1} className="mt-0.5">
              {title}
            </Text>
            <View className="mt-1">
              {isTimeMode ? (
                <TimeValueInline
                  value={formatHours(displayValue)}
                  variant="caption"
                  numberOfLines={1}
                  iconSize={13}
                />
              ) : (
                <Text
                  variant="caption"
                  numberOfLines={1}
                  className={isIncome ? 'text-success' : 'text-foreground'}
                >
                  {formatAmount(displayValue, settings, { showSign: true })}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Action buttons. */}
        <View className="mt-3 flex-row gap-2">
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onViewTransaction(transaction.id);
            }}
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-secondary/60 py-2.5"
          >
            <Eye size={15} color={themeColors.text} />
            <Text variant="label" className="text-foreground">
              {I18n.t('receipts.view_transaction')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (!receiptFileUri) return;
              void triggerHaptic('selection');
              onViewReceipt(receiptFileUri);
            }}
            disabled={!receiptFileUri}
            accessibilityRole="button"
            style={{ opacity: receiptFileUri ? 1 : 0.4 }}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-primary/12 py-2.5"
          >
            <Receipt size={15} color={themeColors.primary} />
            <Text variant="label" className="text-primary">
              {receiptFileUri ? I18n.t('receipts.view_receipt') : I18n.t('receipts.image_missing')}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Pressable>
  );
});
