import {
  ArrowRightLeft,
  Check,
  Pencil,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  Layout,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import type { PreviewTransaction } from '../screens/AIChatScreen';

const CARD_LAYOUT = Layout.springify().damping(15).stiffness(200).mass(0.8);
const CARD_CONTENT_ENTERING = FadeInUp.springify().damping(16).stiffness(180).mass(0.7);
const CARD_CONTENT_EXITING = FadeOut.duration(120);
const CARD_REJECT_EXITING = SlideOutRight.springify().damping(14).stiffness(160).mass(0.6);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TransactionPreviewCardProps {
  transaction: PreviewTransaction;
  acceptDisabled?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
}

function useButtonScale() {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const onPressIn = useCallback(() => {
    'worklet';
    scale.value = withSpring(0.85, { damping: 15, stiffness: 300 });
  }, [scale]);
  const onPressOut = useCallback(() => {
    'worklet';
    scale.value = withSpring(1, { damping: 12, stiffness: 200 });
  }, [scale]);
  return { animatedStyle, onPressIn, onPressOut };
}

const TYPE_CONFIG = {
  expense: { icon: TrendingDown, label: 'Expense' },
  income: { icon: TrendingUp, label: 'Income' },
  transfer: { icon: ArrowRightLeft, label: 'Transfer' },
} as const;

export function TransactionPreviewCard({
  transaction,
  acceptDisabled = false,
  onAccept,
  onReject,
  onEdit,
}: TransactionPreviewCardProps) {
  const themeColors = useThemeColors();
  const cardScale = useSharedValue(1);
  const cardOpacity = useSharedValue(1);
  const acceptBtnScale = useButtonScale();
  const editBtnScale = useButtonScale();
  const rejectBtnScale = useButtonScale();
  const isAnimating = useRef(false);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const typeColor =
    transaction.type === 'expense'
      ? themeColors.error
      : transaction.type === 'income'
        ? themeColors.success
        : themeColors.primary;

  const config = TYPE_CONFIG[transaction.type];
  const TypeIcon = config.icon;

  const isAccepted = transaction.status === 'accepted';
  const isRejected = transaction.status === 'rejected';

  const handleAccept = useCallback(() => {
    if (acceptDisabled || isAnimating.current) return;
    isAnimating.current = true;
    void triggerHaptic('success');
    cardScale.value = withSequence(
      withSpring(1.03, { damping: 12, stiffness: 300 }),
      withSpring(1, { damping: 14, stiffness: 200 }),
    );
    onAccept();
  }, [acceptDisabled, cardScale, onAccept]);

  const handleReject = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    void triggerHaptic('warning');
    cardScale.value = withTiming(0.95, { duration: 80 });
    cardOpacity.value = withTiming(0.7, { duration: 80 });
    setTimeout(() => onReject(), 80);
  }, [cardOpacity, cardScale, onReject]);

  const handleEdit = useCallback(() => {
    void triggerHaptic('selection');
    onEdit();
  }, [onEdit]);

  if (isRejected) return null;

  return (
    <Animated.View
      layout={CARD_LAYOUT}
      exiting={CARD_REJECT_EXITING}
      style={cardAnimatedStyle}
      className="w-full overflow-hidden rounded-2xl"
    >
      {isAccepted ? (
        <Animated.View
          key="accepted"
          entering={CARD_CONTENT_ENTERING}
          exiting={CARD_CONTENT_EXITING}
          className="rounded-2xl border px-4 py-3"
          style={{
            borderColor: `${themeColors.success}30`,
            backgroundColor: `${themeColors.success}08`,
          }}
        >
          <View className="flex-row items-center gap-3">
            <Animated.View
              entering={FadeIn.delay(80).springify().damping(10).stiffness(200)}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: `${themeColors.success}18` }}
            >
              <Check size={16} color={themeColors.success} />
            </Animated.View>
            <View className="min-w-0 flex-1">
              <Text variant="caption" tone="muted" className="text-[10px] uppercase tracking-wider">
                {config.label}
              </Text>
            </View>
            <Text variant="subheading" className="text-base" style={{ color: themeColors.success }}>
              {transaction.currency}
              {transaction.amount.toFixed(2)}
            </Text>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          key="pending"
          entering={CARD_CONTENT_ENTERING}
          exiting={CARD_CONTENT_EXITING}
          className="rounded-2xl border"
          style={{
            borderColor: `${themeColors.border}40`,
            backgroundColor: themeColors.card,
          }}
        >
          {/* Accent stripe */}
          <View
            className="h-1 w-full rounded-t-2xl"
            style={{ backgroundColor: typeColor }}
          />

          <View className="px-4 pb-3.5 pt-3">
            {/* Header: type badge + amount */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2.5">
                <View
                  className="h-8 w-8 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${typeColor}14` }}
                >
                  <TypeIcon size={15} color={typeColor} />
                </View>
                <Text
                  variant="caption"
                  className="font-semibold uppercase tracking-wider text-[11px]"
                  style={{ color: typeColor }}
                >
                  {config.label}
                </Text>
              </View>
              <Text variant="heading" className="text-xl tracking-tight">
                {transaction.currency}
                {transaction.amount.toFixed(2)}
              </Text>
            </View>

            {/* Details rows */}
            <Animated.View
              entering={FadeInDown.delay(60).duration(200)}
              className="mt-3 gap-2"
            >
              {transaction.type === 'transfer' ? (
                <>
                  {transaction.fromAccountName ? (
                    <PreviewField
                      label={I18n.t('transactions.editor.from')}
                      value={transaction.fromAccountName}
                      color={typeColor}
                    />
                  ) : null}
                  {transaction.toAccountName ? (
                    <PreviewField
                      label={I18n.t('transactions.editor.to')}
                      value={transaction.toAccountName}
                      color={typeColor}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  {transaction.categoryName ? (
                    <PreviewField
                      label={I18n.t('transactions.editor.category')}
                      value={
                        transaction.categoryIcon
                          ? `${transaction.categoryIcon} ${transaction.categoryName}`
                          : transaction.categoryName
                      }
                      color={typeColor}
                    />
                  ) : null}
                  {transaction.accountName ? (
                    <PreviewField
                      label={I18n.t('transactions.editor.account')}
                      value={transaction.accountName}
                      color={typeColor}
                    />
                  ) : null}
                </>
              )}
              {transaction.note ? (
                <PreviewField
                  label={I18n.t('transaction_detail.note')}
                  value={transaction.note}
                  color={typeColor}
                />
              ) : null}
              {transaction.showDate ? (
                <PreviewField
                  label={I18n.t('transactions.editor.date')}
                  value={transaction.date}
                  color={typeColor}
                />
              ) : null}
            </Animated.View>

            {/* Action buttons */}
            <View className="mt-3 flex-row items-center justify-end gap-2">
              <AnimatedPressable
                onPressIn={rejectBtnScale.onPressIn}
                onPressOut={rejectBtnScale.onPressOut}
                onPress={handleReject}
                style={[
                  { backgroundColor: `${themeColors.error}10` },
                  rejectBtnScale.animatedStyle,
                ]}
                className="h-9 flex-row items-center gap-1.5 rounded-xl px-3"
                hitSlop={4}
              >
                <X size={14} color={themeColors.error} />
                <Text variant="caption" className="font-medium" style={{ color: themeColors.error }}>
                  {I18n.t('aiChat.reject')}
                </Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPressIn={editBtnScale.onPressIn}
                onPressOut={editBtnScale.onPressOut}
                onPress={handleEdit}
                style={[
                  { backgroundColor: `${themeColors.primary}10` },
                  editBtnScale.animatedStyle,
                ]}
                className="h-9 flex-row items-center gap-1.5 rounded-xl px-3"
                hitSlop={4}
              >
                <Pencil size={13} color={themeColors.primary} />
                <Text
                  variant="caption"
                  className="font-medium"
                  style={{ color: themeColors.primary }}
                >
                  {I18n.t('aiChat.edit')}
                </Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPressIn={acceptBtnScale.onPressIn}
                onPressOut={acceptBtnScale.onPressOut}
                onPress={handleAccept}
                disabled={acceptDisabled}
                style={[
                  {
                    backgroundColor: acceptDisabled
                      ? `${themeColors.border}40`
                      : `${themeColors.success}14`,
                  },
                  acceptBtnScale.animatedStyle,
                ]}
                className="h-9 flex-row items-center gap-1.5 rounded-xl px-3"
                hitSlop={4}
              >
                <Check
                  size={15}
                  color={acceptDisabled ? themeColors.textMuted : themeColors.success}
                />
                <Text
                  variant="caption"
                  className="font-medium"
                  style={{
                    color: acceptDisabled ? themeColors.textMuted : themeColors.success,
                  }}
                >
                  {I18n.t('aiChat.accept')}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function PreviewField({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View className="flex-row items-center gap-3 rounded-lg px-2.5 py-1.5"
      style={{ backgroundColor: `${color}06` }}
    >
      <Text
        variant="caption"
        tone="muted"
        numberOfLines={1}
        className="w-20 shrink-0 text-[10px] uppercase tracking-wider"
      >
        {label}
      </Text>
      <Text variant="body" className="min-w-0 flex-1 text-sm">
        {value}
      </Text>
    </View>
  );
}
