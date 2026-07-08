import { Image } from 'expo-image';
import { ImageOff, SquarePen } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text, TimeValueInline } from '~/components/ui';
import { usePressScale } from '~/hooks/usePressScale';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { formatShortDate } from '~/utils/formatters';

interface ReceiptCardProps {
  transaction: TransactionWithRelations;
  /** Receipt image file URI, pre-resolved by the parent (null when missing on disk). */
  receiptFileUri: string | null;
  /** Amount already formatted for the active display mode (money or time). */
  amountText: string;
  isTimeMode: boolean;
  isIncome: boolean;
  /** Tap the image → open the receipt viewer (replace / remove / close). */
  onOpenReceipt: (transaction: TransactionWithRelations) => void;
  /** Tap the top-right button → open the transaction editor. */
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
}

// Colors that read on the dark scrim: mint for income, red for expense.
const INCOME_COLOR = '#5BE3A3';
const EXPENSE_COLOR = '#FF6B6B';

/**
 * A photo tile for the 2-column receipts grid: the receipt image fills the tile,
 * with the date, note and amount overlaid on a bottom scrim and a single edit
 * button pinned to the top-right. Tapping the image opens the receipt viewer.
 */
export const ReceiptCard = memo(function ReceiptCard({
  transaction,
  receiptFileUri,
  amountText,
  isTimeMode,
  isIncome,
  onOpenReceipt,
  onOpenTransaction,
}: ReceiptCardProps) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.97 });

  const locale = I18n.locale ?? 'en';
  const title =
    transaction.note?.trim() || transaction.categoryName || I18n.t('receipts.title') || '';
  const amountColor = isIncome ? INCOME_COLOR : EXPENSE_COLOR;

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onOpenReceipt(transaction);
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('receipts.view_receipt')}
    >
      <Animated.View
        style={[animatedStyle, { aspectRatio: 3 / 4 }]}
        className="overflow-hidden rounded-2xl border border-border/40 shadow-soft"
      >
        {/* Receipt image, or a placeholder when the file is missing. */}
        {receiptFileUri ? (
          <Image
            source={{ uri: receiptFileUri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View className="flex-1 items-center justify-center bg-secondary">
            <ImageOff size={28} color="rgba(120,120,120,0.9)" />
            <Text variant="label" tone="muted" className="mt-1">
              {I18n.t('receipts.image_missing')}
            </Text>
          </View>
        )}

        {/* Edit button pinned to the top-right → opens the transaction. */}
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onOpenTransaction(transaction);
          }}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('receipts.view_transaction')}
          hitSlop={8}
          className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
        >
          <SquarePen size={15} color="#FFFFFF" />
        </Pressable>

        {/* Bottom scrim: date on top, then the note (left, truncated) with the
            amount aligned to its bottom-right. */}
        <View
          className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-3"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <Text variant="label" numberOfLines={1} className="text-white/70">
            {formatShortDate(transaction.date, locale)}
          </Text>
          <View className="mt-0.5 flex-row items-end justify-between gap-2">
            <Text variant="bodyStrong" numberOfLines={1} className="flex-1 text-white">
              {title}
            </Text>
            {isTimeMode ? (
              <TimeValueInline
                value={amountText}
                variant="bodyStrong"
                textClassName="text-[14px]"
                numberOfLines={1}
                iconSize={13}
                iconColor={amountColor}
                style={{ color: amountColor }}
              />
            ) : (
              <Text
                variant="bodyStrong"
                numberOfLines={1}
                className="text-[14px]"
                style={{ color: amountColor }}
              >
                {amountText}
              </Text>
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
});
