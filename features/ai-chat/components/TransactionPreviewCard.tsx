import { ArrowRightLeft, Check, Pencil, TrendingDown, TrendingUp, X } from 'lucide-react-native';
import { useCallback, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeIn,
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

  const typeConfig = {
    expense: { icon: TrendingDown, color: themeColors.error, label: 'Expense' },
    income: { icon: TrendingUp, color: themeColors.success, label: 'Income' },
    transfer: { icon: ArrowRightLeft, color: themeColors.primary, label: 'Transfer' },
  }[transaction.type];

  const TypeIcon = typeConfig.icon;

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
      className={`w-full rounded-xl border border-border/50 bg-card ${
        isAccepted ? 'px-3 py-2.5' : 'p-3'
      }`}
    >
      {isAccepted ? (
        <Animated.View
          key="accepted"
          entering={CARD_CONTENT_ENTERING}
          exiting={CARD_CONTENT_EXITING}
        >
          <View className="flex-row items-center justify-between gap-3">
            <Text variant="caption" tone="muted" className="text-[10px] uppercase tracking-[0.8px]">
              {I18n.t('transactions.editor.amount')}
            </Text>
            <View className="flex-row items-center gap-2">
              <Text variant="subheading" className="text-base">
                {transaction.currency}
                {transaction.amount.toFixed(2)}
              </Text>
              <Animated.View
                entering={FadeIn.delay(100).springify().damping(10).stiffness(200)}
                className="h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: `${themeColors.success}20` }}
              >
                <Check size={15} color={themeColors.success} />
              </Animated.View>
            </View>
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          key="pending"
          entering={CARD_CONTENT_ENTERING}
          exiting={CARD_CONTENT_EXITING}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              <View
                className="h-7 w-7 items-center justify-center rounded-full"
                style={{ backgroundColor: `${typeConfig.color}18` }}
              >
                <TypeIcon size={14} color={typeConfig.color} />
              </View>
              <Text variant="caption" style={{ color: typeConfig.color }} className="font-semibold">
                {typeConfig.label}
              </Text>
            </View>
            <View className="items-end">
              <Text
                variant="caption"
                tone="muted"
                className="text-[10px] uppercase tracking-[0.8px]"
              >
                {I18n.t('transactions.editor.amount')}
              </Text>
              <Text variant="subheading" className="text-base">
                {transaction.currency}
                {transaction.amount.toFixed(2)}
              </Text>
            </View>
          </View>

          <View className="mt-3 gap-2.5 border-t border-border/40 pt-3">
            {transaction.type === 'transfer' ? (
              <>
                {transaction.fromAccountName ? (
                  <PreviewField
                    label={I18n.t('transactions.editor.from')}
                    value={transaction.fromAccountName}
                  />
                ) : null}
                {transaction.toAccountName ? (
                  <PreviewField
                    label={I18n.t('transactions.editor.to')}
                    value={transaction.toAccountName}
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
                  />
                ) : null}
                {transaction.accountName ? (
                  <PreviewField
                    label={I18n.t('transactions.editor.account')}
                    value={transaction.accountName}
                  />
                ) : null}
              </>
            )}
            {transaction.note ? (
              <PreviewField label={I18n.t('transaction_detail.note')} value={transaction.note} />
            ) : null}
            {transaction.showDate ? (
              <PreviewField label={I18n.t('transactions.editor.date')} value={transaction.date} />
            ) : null}
          </View>

          <View className="mt-2.5 flex-row items-center justify-end gap-1.5">
            <AnimatedPressable
              onPressIn={acceptBtnScale.onPressIn}
              onPressOut={acceptBtnScale.onPressOut}
              onPress={handleAccept}
              disabled={acceptDisabled}
              style={[
                {
                  backgroundColor: acceptDisabled
                    ? `${themeColors.border}40`
                    : `${themeColors.success}20`,
                },
                acceptBtnScale.animatedStyle,
              ]}
              className="h-8 w-8 items-center justify-center rounded-full"
              hitSlop={4}
            >
              <Check
                size={16}
                color={acceptDisabled ? themeColors.textMuted : themeColors.success}
              />
            </AnimatedPressable>
            <AnimatedPressable
              onPressIn={editBtnScale.onPressIn}
              onPressOut={editBtnScale.onPressOut}
              onPress={handleEdit}
              style={[{ backgroundColor: `${themeColors.primary}20` }, editBtnScale.animatedStyle]}
              className="h-8 w-8 items-center justify-center rounded-full"
              hitSlop={4}
            >
              <Pencil size={14} color={themeColors.primary} />
            </AnimatedPressable>
            <AnimatedPressable
              onPressIn={rejectBtnScale.onPressIn}
              onPressOut={rejectBtnScale.onPressOut}
              onPress={handleReject}
              style={[{ backgroundColor: `${themeColors.error}20` }, rejectBtnScale.animatedStyle]}
              className="h-8 w-8 items-center justify-center rounded-full"
              hitSlop={4}
            >
              <X size={16} color={themeColors.error} />
            </AnimatedPressable>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

function PreviewField({
  label,
  value,
  valueTone = 'secondary',
}: {
  label: string;
  value: string;
  valueTone?: 'default' | 'secondary' | 'muted' | 'primary' | 'success' | 'warning' | 'error';
}) {
  return (
    <View className="flex-row items-start gap-3">
      <Text
        variant="caption"
        tone="muted"
        numberOfLines={1}
        className="w-24 shrink-0 pt-0.5 text-left text-[10px] uppercase tracking-[0.8px]"
      >
        {label}
      </Text>
      <Text variant="body" tone={valueTone} className="min-w-0 flex-1 text-sm leading-5">
        {value}
      </Text>
    </View>
  );
}
