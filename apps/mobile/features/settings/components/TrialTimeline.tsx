import { Bell, Crown, LockOpen } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';
import { formatWeekdayMonthDay } from '~/utils/formatters';

import { TRIAL_REMINDER_LEAD_DAYS, type TrialTimeline as Timeline } from '../lib/trialTimeline';

interface Step {
  key: string;
  label: string;
  body: string;
  Icon: typeof Bell;
  current: boolean;
}

/**
 * "How your free trial works" on the paywall, under the plans, while the
 * selected plan has a free trial: today, the reminder (only when the phone can
 * show one) and the day the trial ends and the price starts. The dates come
 * from `buildTrialTimeline`, the same rule that schedules the reminder.
 */
export function TrialTimeline({
  timeline,
  priceLabel,
  primary,
  onPrimary,
}: {
  timeline: Timeline;
  priceLabel: string;
  /** The theme's accent, for the outlined icons. */
  primary: string;
  /** The icon colour on the filled accent node, as the paywall's own buttons use. */
  onPrimary: string;
}) {
  const steps: Step[] = [
    {
      key: 'today',
      label: I18n.t('common.today'),
      body: I18n.t('pro.trial_timeline_today_body'),
      Icon: LockOpen,
      current: true,
    },
    ...(timeline.remindAt
      ? [
          {
            key: 'reminder',
            label: formatWeekdayMonthDay(timeline.remindAt),
            body: I18n.t('pro.trial_timeline_reminder_body', { count: TRIAL_REMINDER_LEAD_DAYS }),
            Icon: Bell,
            current: false,
          },
        ]
      : []),
    {
      key: 'ends',
      label: formatWeekdayMonthDay(timeline.endsAt),
      body: I18n.t('pro.trial_timeline_end_body', { price: priceLabel }),
      Icon: Crown,
      current: false,
    },
  ];

  return (
    <View className="mt-1 rounded-[20px] border border-border/50 bg-card px-4 pb-4 pt-3.5">
      <Text className="text-base font-extrabold text-foreground" accessibilityRole="header">
        {I18n.t('pro.trial_timeline_title')}
      </Text>
      <View className="mt-3">
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          return (
            <View key={step.key} className="flex-row gap-3">
              <View className="items-center">
                <View
                  className={cn(
                    'h-8 w-8 items-center justify-center rounded-full border-2 border-primary',
                    step.current ? 'bg-primary' : 'bg-card',
                  )}
                >
                  <step.Icon
                    size={15}
                    strokeWidth={2.4}
                    color={step.current ? onPrimary : primary}
                  />
                </View>
                {last ? null : <View className="w-0.5 flex-1 bg-primary/35" />}
              </View>
              <View className={cn('flex-1 pt-1', last ? 'pb-0' : 'pb-3.5')}>
                <Text className="text-[15px] font-extrabold text-foreground">{step.label}</Text>
                <Text className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
                  {step.body}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
