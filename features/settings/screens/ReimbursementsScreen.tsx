import { Receipt } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  AccountPickerSheet,
  Card,
  CardContent,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp, useTransactions } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { isOutstandingClaim, outstandingClaimAmount } from '~/utils/claims';
import {
  amountToHoursByRate,
  formatAmount,
  formatHours,
  formatRelativeDate,
} from '~/utils/formatters';

interface ReimbursementsScreenProps {
  onBack: () => void;
}

export function ReimbursementsScreen({ onBack }: ReimbursementsScreenProps) {
  const { settings, accounts, accountGroups, getTrueHourlyRateForDate, markReimbursed } = useApp();
  const { transactions } = useTransactions();
  // "How much am I owed" reads clearest as money regardless of the app's global
  // money/time display mode; the summary surfaces the time framing separately.
  const moneySettings = useMemo(() => ({ ...settings, displayMode: 'money' as const }), [settings]);
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();
  // The claimable expense currently being settled (drives the account picker).
  const [claimingTx, setClaimingTx] = useState<TransactionWithRelations | null>(null);

  // Outstanding claimable expenses, most recent first. Reimbursement inflows are
  // income (not claimable) so they never appear here.
  const outstanding = useMemo(
    () =>
      transactions
        .filter((tx) => tx.type === 'expense' && isOutstandingClaim(tx))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [transactions],
  );

  // Totals in the reporting currency via each row's frozen fx rate, plus the
  // money2time "hours of your time" framing.
  const summary = useMemo(() => {
    let totalReporting = 0;
    let totalHours = 0;
    for (const tx of outstanding) {
      const outReporting = outstandingClaimAmount(tx) * (tx.fxRate ?? 1);
      totalReporting += outReporting;
      const rate = getTrueHourlyRateForDate(tx.date);
      if (rate > 0) totalHours += amountToHoursByRate(outReporting, rate);
    }
    return { totalReporting, totalHours, count: outstanding.length };
  }, [outstanding, getTrueHourlyRateForDate]);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        title={I18n.t('reimbursements.title')}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: SETTINGS_HORIZONTAL_PADDING, paddingBottom: 32 },
          bottomNavInset,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {outstanding.length === 0 ? (
          <View className="items-center px-6 pt-24">
            <Receipt size={40} color={themeColors.textMuted} />
            <Text variant="bodyStrong" className="mt-4 text-center">
              {I18n.t('reimbursements.empty_title')}
            </Text>
            <Text variant="caption" tone="muted" className="mt-1 text-center">
              {I18n.t('reimbursements.empty_message')}
            </Text>
          </View>
        ) : (
          <>
            <Card>
              <CardContent>
                <Text variant="caption" tone="muted">
                  {I18n.t('reimbursements.outstanding_total')}
                </Text>
                <Text variant="title" className="mt-1">
                  {formatAmount(summary.totalReporting, moneySettings)}
                </Text>
                <View className="mt-1 flex-row items-center gap-2">
                  {summary.totalHours > 0 ? (
                    <Text variant="caption" tone="muted">
                      {I18n.t('reimbursements.outstanding_hours', {
                        hours: formatHours(summary.totalHours),
                      })}
                      {'  ·  '}
                    </Text>
                  ) : null}
                  <Text variant="caption" tone="muted">
                    {I18n.t('reimbursements.outstanding_count', { count: summary.count })}
                  </Text>
                </View>
              </CardContent>
            </Card>

            <View className="mt-4 gap-2">
              {outstanding.map((tx) => {
                const title = tx.note || tx.categoryName || I18n.t('common.uncategorized');
                return (
                  <View
                    key={tx.id}
                    className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-card px-4 py-3"
                  >
                    <View className="flex-1 pr-3">
                      <Text variant="body" numberOfLines={1}>
                        {title}
                      </Text>
                      <Text variant="caption" tone="muted" className="mt-0.5">
                        {formatRelativeDate(tx.date)}
                        {'  ·  '}
                        {formatAmount(outstandingClaimAmount(tx), moneySettings, {
                          currencyCode: tx.currency,
                        })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setClaimingTx(tx);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('reimbursements.claim')}
                      className="h-9 items-center justify-center rounded-full border border-success/40 bg-success/15 px-4"
                    >
                      <Text variant="caption" className="text-success">
                        {I18n.t('reimbursements.claim')}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <AccountPickerSheet
        visible={claimingTx !== null}
        onClose={() => setClaimingTx(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={claimingTx?.reimbursementAccountId ?? claimingTx?.accountId ?? null}
        onSelect={(accountId) => {
          if (claimingTx) {
            void triggerHaptic('success');
            markReimbursed(claimingTx.id, { accountId });
          }
          setClaimingTx(null);
        }}
      />
    </SettingsPageLayout>
  );
}
