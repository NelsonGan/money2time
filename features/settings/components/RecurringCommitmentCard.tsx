import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Trash2 } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { hasSubscriptionLogoArt, SubscriptionLogo } from '~/components/ui/SubscriptionLogo';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { RecurringTransactionRule } from '~/types';
import { cn } from '~/utils';

/** Box the brand mark, category icon or fallback arrow is centred in. */
const ICON_BOX = 34;

export type RecurringCardBadge = 'paused' | 'overdue' | null;

export interface RecurringCommitmentCardProps {
  ruleId: string;
  name: string;
  type: RecurringTransactionRule['type'];
  /** Dims the whole card; a paused rule is not going to charge anyone. */
  isActive: boolean;
  amountLabel: string;
  /** The line under the name: cadence, next run, monthly equivalent. */
  metaLabel: string;
  /** Trailing line under the amount (a monthly or reporting-currency equivalent). */
  amountNoteLabel?: string;
  badge?: RecurringCardBadge;
  categoryIcon: string | null;
  categoryParentIcon: string | null;
  logoId: string | null;
  onPress: (ruleId: string) => void;
  /** Omitted on the forecast, where a card is a scheduled charge, not a rule. */
  onDelete?: (ruleId: string, name: string) => void;
}

function CommitmentIcon({
  type,
  isActive,
  logoId,
  categoryIcon,
  categoryParentIcon,
}: Pick<
  RecurringCommitmentCardProps,
  'type' | 'isActive' | 'logoId' | 'categoryIcon' | 'categoryParentIcon'
>) {
  const themeColors = useThemeColors();
  const tone =
    type === 'income'
      ? themeColors.success
      : type === 'transfer'
        ? themeColors.text
        : themeColors.coral;
  const color = isActive ? tone : themeColors.textMuted;
  const Fallback =
    type === 'income' ? ArrowDownLeft : type === 'transfer' ? ArrowLeftRight : ArrowUpRight;

  return (
    <View
      style={{ width: ICON_BOX, height: ICON_BOX }}
      className={cn('items-center justify-center', isActive ? '' : 'opacity-40')}
    >
      {hasSubscriptionLogoArt(logoId) ? (
        <SubscriptionLogo logoId={logoId} size={30} hideFallback />
      ) : categoryIcon || categoryParentIcon ? (
        <CategoryEmoji
          icon={categoryIcon}
          parentIcon={categoryParentIcon}
          size={30}
          className="text-[26px]"
          hidePlaceholder
        />
      ) : (
        <Fallback size={20} color={color} />
      )}
    </View>
  );
}

/**
 * One commitment, as a card. Used both for a scheduled charge on the forecast
 * timeline and for a rule in the full list — the two differ only in what the
 * meta line says and whether a delete affordance is offered.
 */
export const RecurringCommitmentCard = React.memo(function RecurringCommitmentCard({
  ruleId,
  name,
  type,
  isActive,
  amountLabel,
  metaLabel,
  amountNoteLabel,
  badge = null,
  categoryIcon,
  categoryParentIcon,
  logoId,
  onPress,
  onDelete,
}: RecurringCommitmentCardProps) {
  const themeColors = useThemeColors();

  const handlePress = useCallback(() => {
    void triggerHaptic('selection');
    onPress(ruleId);
  }, [onPress, ruleId]);

  const handleDelete = useCallback(() => {
    void triggerHaptic('warning');
    onDelete?.(ruleId, name);
  }, [name, onDelete, ruleId]);

  const amountTone = !isActive
    ? 'text-muted-foreground'
    : type === 'income'
      ? 'text-success'
      : type === 'transfer'
        ? 'text-foreground'
        : 'text-destructive';

  // The delete button is a sibling of the card's own press target rather than a
  // child of it: nesting one Pressable inside another leaves both reacting to
  // the same touch.
  return (
    <View className="flex-row items-center rounded-2xl border border-border/45 bg-card pr-1">
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={name}
        className="flex-1 flex-row items-center gap-3 py-2.5 pl-3 pr-2 active:opacity-70"
      >
        <CommitmentIcon
          type={type}
          isActive={isActive}
          logoId={logoId}
          categoryIcon={categoryIcon}
          categoryParentIcon={categoryParentIcon}
        />

        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text
              variant="caption"
              numberOfLines={1}
              className={cn('flex-shrink', isActive ? 'text-foreground' : 'text-muted-foreground')}
            >
              {name}
            </Text>
            {badge ? (
              <View
                className={cn(
                  'rounded-full px-1.5 py-0.5',
                  badge === 'overdue' ? 'bg-warning/15' : 'bg-muted/70',
                )}
              >
                <Text
                  variant="label"
                  className={cn(
                    'text-[8px]',
                    badge === 'overdue' ? 'text-warning' : 'text-muted-foreground',
                  )}
                >
                  {I18n.t(badge === 'overdue' ? 'recurring.overdue' : 'recurring.paused')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="label" className="text-[10px] normal-case tracking-normal" tone="muted">
            {metaLabel}
          </Text>
        </View>

        <View className="items-end gap-0.5 pl-1">
          <Text variant="bodyStrong" className={cn('text-[15px]', amountTone)}>
            {amountLabel}
          </Text>
          {amountNoteLabel ? (
            <Text variant="label" className="text-[10px] normal-case tracking-normal" tone="muted">
              {amountNoteLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {onDelete ? (
        <Pressable
          onPress={handleDelete}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.delete')}
          className="h-9 w-8 items-center justify-center active:opacity-60"
        >
          <Trash2 size={15} color={themeColors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
});
