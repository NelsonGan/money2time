import {
  ArrowRight,
  Bell,
  Lock,
  Monitor,
  Plus,
  Receipt,
  Smartphone,
  Zap,
} from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { NAV_TAB_META } from '~/components/navigation/BottomNav';
import type { TabName } from '~/components/navigation/navTabs';
import { Text } from '~/components/ui';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { CARD_DESIGN_ASPECT_RATIO, resolveCardDesignAppearance } from '~/constants/cardDesigns';
import { useApp } from '~/context/AppContext';
import { CardDesignPreview } from '~/features/settings/components/AccountCardDesign';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { formatAmount } from '~/utils/formatters';

interface ShowcaseProps {
  width: number;
}

function useMoneySettings() {
  const { settings } = useApp();
  return { ...settings, displayMode: 'money' as const };
}

const DASHBOARD_BARS = [0.45, 0.7, 0.38, 0.92, 0.6, 0.78, 0.52] as const;

export function WebDashboardShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const money = useMoneySettings();

  return (
    <View className="gap-3" style={{ width }}>
      <View className="overflow-hidden rounded-[18px] border border-border/30 bg-card">
        <View className="flex-row items-center gap-2 border-b border-border/30 px-3 py-2">
          <View className="flex-row gap-1">
            <View className="h-2 w-2 rounded-full bg-coral/70" />
            <View className="h-2 w-2 rounded-full bg-warning/70" />
            <View className="h-2 w-2 rounded-full bg-success/70" />
          </View>
          <View className="min-w-0 flex-1 flex-row items-center justify-center gap-1 rounded-full bg-secondary/50 px-2 py-0.5">
            <Lock size={10} color={colors.textMuted} />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              app.money2time.com
            </Text>
          </View>
        </View>
        <View className="gap-3 p-3">
          <View className="flex-row gap-2">
            <View className="min-w-0 flex-1 rounded-xl bg-success/10 px-3 py-2">
              <Text variant="label" tone="success" numberOfLines={1}>
                {I18n.t('news.showcase.income')}
              </Text>
              <Text variant="mono" numberOfLines={1}>
                {formatAmount(4200, money, { showSign: false })}
              </Text>
            </View>
            <View className="min-w-0 flex-1 rounded-xl bg-destructive/10 px-3 py-2">
              <Text variant="label" tone="error" numberOfLines={1}>
                {I18n.t('news.showcase.expense')}
              </Text>
              <Text variant="mono" numberOfLines={1}>
                {formatAmount(2650, money, { showSign: false })}
              </Text>
            </View>
          </View>
          <View className="h-14 flex-row items-end gap-1.5">
            {DASHBOARD_BARS.map((ratio, index) => (
              <View
                key={index}
                className="flex-1 bg-primary/70"
                style={{
                  height: `${ratio * 100}%`,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                }}
              />
            ))}
          </View>
        </View>
      </View>
      <View className="flex-row items-center justify-center gap-3">
        <Smartphone size={20} color={colors.primary} />
        <ArrowRight size={16} color={colors.textMuted} />
        <Monitor size={20} color={colors.primary} />
      </View>
    </View>
  );
}

export function NotificationReviewShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const money = useMoneySettings();

  return (
    <View className="gap-3" style={{ width }}>
      <View className="flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-3 py-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-sky/15">
          <Bell size={20} color={colors.sky} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong" numberOfLines={1}>
            {I18n.t('news.showcase.notification_bank')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {I18n.t('news.showcase.notification_text')}
          </Text>
        </View>
        <Text variant="mono" numberOfLines={1}>
          {formatAmount(12.5, money, { showSign: false })}
        </Text>
      </View>
      <View className="flex-row gap-2">
        <View className="min-w-0 flex-1 items-center rounded-full border border-border/40 bg-card py-2">
          <Text variant="label" tone="success" numberOfLines={1}>
            {I18n.t('nav.income')}
          </Text>
        </View>
        <View className="min-w-0 flex-1 items-center rounded-full bg-destructive py-2">
          <Text variant="label" numberOfLines={1} style={{ color: '#fff' }}>
            {I18n.t('nav.expense')}
          </Text>
        </View>
        <View className="min-w-0 flex-1 items-center rounded-full border border-border/40 bg-card py-2">
          <Text variant="label" tone="muted" numberOfLines={1}>
            {I18n.t('payment_alerts.review_ignore')}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function FasterScansShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View className="gap-4" style={{ width }}>
      <View className="flex-row items-center justify-center gap-2">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-success/15">
          <Receipt size={22} color={colors.success} />
        </View>
        <Text variant="bodyStrong">{I18n.t('add_action.scan_title')}</Text>
      </View>
      <View className="gap-2.5">
        <View className="gap-1">
          <Text variant="caption" tone="muted">
            {I18n.t('news.showcase.scan_before')}
          </Text>
          <View className="h-3 w-full rounded-full bg-border" />
        </View>
        <View className="gap-1">
          <View className="flex-row items-center gap-1">
            <Text variant="caption" tone="success">
              {I18n.t('news.showcase.scan_now')}
            </Text>
            <Zap size={12} color={colors.success} fill={colors.success} />
          </View>
          <View className="h-3 w-1/2 rounded-full bg-success" />
        </View>
      </View>
    </View>
  );
}

const SHOWCASE_CARDS = [
  { design: 'mascot/coin-pattern', nameKey: 'news.showcase.card_everyday', balance: 320 },
  { design: 'space/nebula', nameKey: 'news.showcase.card_travel', balance: 85 },
] as const;

/** How much of each card above the front one peeks out of the stack. */
const STACK_PEEK = 42;

export function CardDesignsShowcase({ width }: ShowcaseProps) {
  const money = useMoneySettings();
  const cardHeight = Math.round(width / CARD_DESIGN_ASPECT_RATIO);
  const cards = SHOWCASE_CARDS.flatMap((card) => {
    // Templates only: there is no upload to resolve, so the custom resolver is a no-op.
    const appearance = resolveCardDesignAppearance(card.design, () => null);
    return appearance ? [{ ...card, appearance }] : [];
  });

  return (
    <View style={{ width }}>
      {cards.map((card, index) => (
        <View key={card.design} style={index > 0 ? { marginTop: STACK_PEEK - cardHeight } : null}>
          <CardDesignPreview
            value={card.design}
            appearance={card.appearance}
            accountName={I18n.t(card.nameKey)}
            accountType="debit"
            balanceLabel={formatAmount(card.balance, money, { showSign: false })}
            height={cardHeight}
          />
        </View>
      ))}
    </View>
  );
}

const SHOWCASE_BAR: readonly TabName[] = ['calendar', 'goals', 'insights', 'receipts', 'settings'];
const SHOWCASE_MORE: readonly TabName[] = ['recurring', 'reimbursements', 'settleUp'];

export function BottomBarShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View className="gap-3" style={{ width }}>
      <View className="flex-row flex-wrap justify-center gap-2">
        {SHOWCASE_MORE.map((tab) => (
          <View
            key={tab}
            className="flex-row items-center gap-1.5 rounded-full border border-dashed border-border/60 bg-card px-2.5 py-1.5"
          >
            <ClayIcon
              name={NAV_TAB_META[tab].icon}
              size={18}
              flatSize={14}
              flatColor={colors.textMuted}
            />
            <Text variant="caption" numberOfLines={1}>
              {I18n.t(NAV_TAB_META[tab].labelKey)}
            </Text>
            <Plus size={12} color={colors.textMuted} />
          </View>
        ))}
      </View>
      <View className="flex-row items-center justify-around rounded-full border border-border/40 bg-card px-2 py-2.5 shadow-soft">
        {SHOWCASE_BAR.map((tab, index) => (
          <View
            key={tab}
            className="items-center gap-1"
            style={{ opacity: index === 0 ? 1 : 0.72 }}
          >
            <ClayIcon
              name={index === 0 ? NAV_TAB_META[tab].activeIcon : NAV_TAB_META[tab].icon}
              size={index === 0 ? 30 : 26}
              flatSize={20}
              flatColor={index === 0 ? colors.primary : colors.textMuted}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
