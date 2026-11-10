import { ChevronRight } from 'lucide-react-native';
import React, { forwardRef, useCallback, useEffect, useMemo } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MonthYearWheelPicker } from '~/components/datePicker';
import { EmptyState } from '~/components/feedback/EmptyState';
import { useContentFrame } from '~/components/layout/ContentFrame';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import {
  CategoryEmoji,
  ClayIcon,
  SETTINGS_LIST_BOTTOM_PADDING,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { spacing } from '~/constants/designSystem';
import { useApp, useTransactions } from '~/context/AppContext';
import { monthKeyLabel, monthNameLabel } from '~/features/budget/lib/format';
import { InsightCard, SpendDeltaPill } from '~/features/insights/components/InsightCard';
import type { InsightsDrilldownPayload } from '~/features/insights/screens/InsightsDrilldownScreen';
import { filterSpendingTransactions } from '~/features/reimbursements/lib/reimbursementMath';
import { money, shortDayLabel } from '~/features/review/lib/reviewFormat';
import { UNCATEGORIZED_ID } from '~/features/review/lib/reviewMath';
import {
  type MonthPagerEdges,
  type MonthPagerHandle,
  useMonthKeyPager,
} from '~/hooks/useMonthKeyPager';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, TransactionWithRelations, UserSettings } from '~/types';
import { withColorAlpha } from '~/utils/color';
import { financialMonthKeyForDate, monthCycleOf } from '~/utils/financialMonth';
import { toSpendingRows } from '~/utils/spending';

import { PersonAvatar } from '../components/PersonAvatar';
import {
  buildHouseholdIndex,
  buildHouseholdMonth,
  buildPeopleStyles,
  type HouseholdCategory,
  type HouseholdMonth,
  householdPagerMonths,
  OWNER_KEY,
  type PersonAmount,
  personKey,
  type PersonStyle,
} from '../lib/householdMath';
import { useOpenLedgerPeople } from '../lib/ledgerPeople';

interface HouseholdPagerViewProps {
  /** Opens the transactions behind a person or a category. */
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  /** Reports the shown month's label, so the host header can show it. */
  onActiveMonthLabelChange?: (label: string) => void;
  /** Reports whether the pager is at its first or last month, for the header's arrows. */
  onEdgesChange?: (edges: MonthPagerEdges) => void;
}

const TREND_HEIGHT = 108;

function percentLabel(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * The Household insights page of a shared ledger: one page per month, each
 * a stack of cards about the people in it (README.md > Shared ledgers >
 * Household insights). Embedded in Insights, which shows it only while the
 * open ledger is shared.
 */
export const HouseholdPagerView = forwardRef<MonthPagerHandle, HouseholdPagerViewProps>(
  function HouseholdPagerViewImpl(
    { onOpenDrilldown, onOpenTransaction, onActiveMonthLabelChange, onEdgesChange },
    ref,
  ) {
    const { settings, categories } = useApp();
    const { transactions } = useTransactions();
    const people = useOpenLedgerPeople();
    const monthCycle = useMemo(() => monthCycleOf(settings), [settings]);
    const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
    const { width: pageWidth } = useContentFrame();

    const personKeyOf = useCallback(
      (memberId: string | null) =>
        people ? personKey(people.personFor(memberId)) : (memberId ?? OWNER_KEY),
      [people],
    );

    const index = useMemo(
      () =>
        buildHouseholdIndex(
          toSpendingRows(
            filterSpendingTransactions(transactions, settings.reimbursementsCountAsExpense),
          ),
          personKeyOf,
          monthCycle,
        ),
      [monthCycle, personKeyOf, settings.reimbursementsCountAsExpense, transactions],
    );

    // Everyone in the ledger, then anyone else found on an entry (someone who
    // left), each with a short name, the same on every month's page.
    const { peopleOrder, styleByKey } = useMemo(
      () => buildPeopleStyles(people, index.months.values()),
      [index, people],
    );

    const currentMonthKey = financialMonthKeyForDate(new Date(), monthCycle);
    const pagerMonths = useMemo(
      () => householdPagerMonths(index.firstMonthKey, currentMonthKey),
      [currentMonthKey, index.firstMonthKey],
    );
    const { months, listRef, pager, activeMonth, jumpToMonth, monthWheel } = useMonthKeyPager({
      months: pagerMonths,
      pageWidth,
      initialIndex: pagerMonths.length - 1,
      ref,
      onEdgesChange,
    });

    const monthLabel = monthKeyLabel(activeMonth, settings.locale);
    useEffect(() => {
      onActiveMonthLabelChange?.(monthLabel);
    }, [monthLabel, onActiveMonthLabelChange]);

    const categoriesById = useMemo(
      () => new Map(categories.map((category) => [category.id, category])),
      [categories],
    );
    const transactionsById = useMemo(
      () => new Map(transactions.map((transaction) => [transaction.id, transaction])),
      [transactions],
    );

    // Each month's numbers, built once per data change rather than on every
    // render of its page.
    const monthFor = useMemo(() => {
      const built = new Map<string, HouseholdMonth>();
      return (monthKey: string): HouseholdMonth => {
        let month = built.get(monthKey);
        if (!month) {
          month = buildHouseholdMonth({
            index,
            monthKey,
            isRunning: monthKey === currentMonthKey,
            peopleOrder,
            categoriesById,
          });
          built.set(monthKey, month);
        }
        return month;
      };
    }, [categoriesById, currentMonthKey, index, peopleOrder]);

    // A tap on another month's bar in the trend opens that month's page.
    const selectMonth = useCallback(
      (monthKey: string) => {
        if (!months.includes(monthKey)) return null;
        return () => {
          void triggerHaptic('selection');
          jumpToMonth(monthKey);
        };
      },
      [jumpToMonth, months],
    );

    const renderMonthPage = useCallback(
      ({ item: slot }: { item: number }) => {
        const monthKey = months[slot];
        if (!monthKey) return <View style={{ width: pageWidth }} />;
        const month = monthFor(monthKey);
        const label = monthKeyLabel(monthKey, settings.locale);
        const openIds = (drilldownLabel: string, transactionIds: string[]) => {
          if (transactionIds.length === 0) return;
          void triggerHaptic('selection');
          onOpenDrilldown({ label: drilldownLabel, transactionIds, showTypeFilter: false });
        };
        return (
          <View style={{ width: pageWidth }} className="h-full shrink-0">
            <ScrollView
              contentContainerStyle={[styles.content, listNavInset]}
              showsVerticalScrollIndicator={false}
            >
              {/* A readable column on a tablet, as on Review. */}
              <TabletContentContainer>
                {month.isEmpty ? (
                  <EmptyState
                    mascotName="sleeping"
                    title={I18n.t('household.empty_title')}
                    message={I18n.t('household.empty_body')}
                    animateIn={false}
                  />
                ) : (
                  <View style={styles.cardStack}>
                    <TogetherCard
                      month={month}
                      styleByKey={styleByKey}
                      settings={settings}
                      onOpenPerson={(style) =>
                        openIds(
                          I18n.t('household.person_month', {
                            name: style.person.name,
                            month: label,
                          }),
                          month.transactionIdsByPerson.get(personKey(style.person)) ?? [],
                        )
                      }
                    />
                    <CoversCard
                      categories={month.categories}
                      categoriesById={categoriesById}
                      transactionsById={transactionsById}
                      styleByKey={styleByKey}
                      settings={settings}
                      onOpenCategory={(category, name) =>
                        // The month too, as on a person's entries: the list holds only its entries.
                        openIds(
                          I18n.t('household.person_month', { name, month: label }),
                          category.transactionIds,
                        )
                      }
                    />
                    <TrendCard
                      month={month}
                      styleByKey={styleByKey}
                      settings={settings}
                      onSelectMonth={selectMonth}
                    />
                    <BiggestCard
                      month={month}
                      transactionsById={transactionsById}
                      categoriesById={categoriesById}
                      styleByKey={styleByKey}
                      settings={settings}
                      onOpenTransaction={onOpenTransaction}
                    />
                  </View>
                )}
              </TabletContentContainer>
            </ScrollView>
          </View>
        );
      },
      [
        categoriesById,
        listNavInset,
        monthFor,
        months,
        onOpenDrilldown,
        onOpenTransaction,
        pageWidth,
        selectMonth,
        settings,
        styleByKey,
        transactionsById,
      ],
    );

    // The ledger stopped being shared (or another was opened): the host opens
    // Review on its next effect, so draw nothing rather than a page of nobody.
    if (!people) return null;

    return (
      <>
        <FlatList
          ref={listRef}
          data={pager.slots}
          renderItem={renderMonthPage}
          keyExtractor={pager.keyExtractor}
          getItemLayout={pager.getItemLayout}
          onMomentumScrollEnd={pager.handleMomentumEnd}
          onScrollEndDrag={pager.handleScrollEndDrag}
          onScrollToIndexFailed={pager.handleScrollToIndexFailed}
          initialScrollIndex={pager.activeIndex}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          // FlatList clips by default on Android, and a clipped page that
          // nests a ScrollView can stay detached after a swipe: the header
          // shows the month, the page stays blank. windowSize caps the pages.
          // Pages are h-full shrink-0, not flex-1: a zero flex basis can
          // collapse a newly mounted Android cell (as on Insights, #567).
          removeClippedSubviews={false}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={3}
          className="flex-1"
        />

        {/* The pager runs from the first month with spending to this one. */}
        <MonthYearWheelPicker {...monthWheel} locale={settings.locale} />
      </>
    );
  },
);

/** A full-width bar split into each person's part, in their colours. */
function ShareBar({
  parts,
  styleByKey,
  widthRatio = 1,
  height,
}: {
  parts: PersonAmount[];
  styleByKey: Map<string, PersonStyle>;
  widthRatio?: number;
  height: number;
}) {
  // Someone with nothing would only leave a doubled hairline.
  const shown = parts.filter((part) => part.amount > 0);
  const total = shown.reduce((sum, part) => sum + part.amount, 0);
  return (
    <View
      {...REPLAY_PRIVATE}
      className="flex-row overflow-hidden rounded-full"
      style={{ height, width: `${Math.max(widthRatio, 0.02) * 100}%` }}
      // Read out by the rows beside it.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {total > 0
        ? shown.map((part, position) => {
            const color = styleByKey.get(part.personKey)?.person.color ?? '#94A3A0';
            return (
              <View
                key={part.personKey}
                style={{
                  flex: part.amount / total,
                  backgroundColor: color,
                  // A hairline between two people, so equal colours never merge.
                  marginLeft: position === 0 ? 0 : 1.5,
                }}
              />
            );
          })
        : null}
    </View>
  );
}

function TogetherCard({
  month,
  styleByKey,
  settings,
  onOpenPerson,
}: {
  month: HouseholdMonth;
  styleByKey: Map<string, PersonStyle>;
  settings: UserSettings;
  onOpenPerson: (style: PersonStyle) => void;
}) {
  const themeColors = useThemeColors();
  // Biggest part first; the page's order breaks ties, so nobody jumps about.
  const rows = [...month.people].sort((a, b) => b.amount - a.amount);
  const alone = month.people.length < 2;
  return (
    // The month is in the header above, so the card does not repeat it.
    <InsightCard title={I18n.t('household.spent_together')}>
      <View className="flex-row flex-wrap items-center gap-2.5">
        <Text variant="display">{money(month.total, settings)}</Text>
        {month.changeRatio !== null ? <SpendDeltaPill changeRatio={month.changeRatio} /> : null}
      </View>

      {alone ? (
        // Nobody has joined yet: one person's "100%" says nothing.
        <Text variant="caption" tone="muted" className="mt-2">
          {I18n.t('household.alone_hint')}
        </Text>
      ) : (
        <>
          <View className="mt-3">
            <ShareBar parts={month.people} styleByKey={styleByKey} height={12} />
          </View>

          <View className="mt-3 gap-0.5">
            {rows.map((part) => {
              const style = styleByKey.get(part.personKey);
              if (!style) return null;
              const share = month.total > 0 ? part.amount / month.total : 0;
              const hasEntries =
                (month.transactionIdsByPerson.get(part.personKey)?.length ?? 0) > 0;
              return (
                <Pressable
                  key={part.personKey}
                  onPress={hasEntries ? () => onOpenPerson(style) : undefined}
                  disabled={!hasEntries}
                  accessibilityRole={hasEntries ? 'button' : undefined}
                  accessibilityLabel={I18n.t('household.person_share', {
                    name: style.person.name,
                    amount: money(part.amount, settings),
                    percent: percentLabel(share),
                  })}
                  className="flex-row items-center gap-3 rounded-2xl py-1.5 active:opacity-70"
                  // Someone who spent nothing stays listed, quietly.
                  style={hasEntries ? undefined : styles.quiet}
                >
                  <PersonAvatar person={style.person} size={30} />
                  {/* A photo hides the person's colour, so the bar's key moves beside it. */}
                  {style.person.avatarFileUri ? (
                    <View
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: style.person.color }}
                    />
                  ) : null}
                  <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
                    {style.person.name}
                  </Text>
                  <Text variant="bodyStrong">{money(part.amount, settings)}</Text>
                  <Text
                    variant="caption"
                    tone="muted"
                    numberOfLines={1}
                    className="min-w-[42px] text-right"
                  >
                    {percentLabel(share)}
                  </Text>
                  <ChevronRight
                    size={14}
                    color={hasEntries ? themeColors.textMuted : 'transparent'}
                  />
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </InsightCard>
  );
}

function CategoryTile({ category }: { category: Category | undefined }) {
  return (
    <View className="h-9 w-9 items-center justify-center rounded-2xl bg-surface-muted/70">
      {category ? (
        <CategoryEmoji icon={category.icon} size={22} />
      ) : (
        <ClayIcon name="money-time/invoice" size={22} />
      )}
    </View>
  );
}

/**
 * A category's name from one of its entries, which still carry it after the
 * category is deleted (the bucket keeps the deleted one's id).
 */
function nameFromEntries(
  category: HouseholdCategory,
  transactionsById: Map<string, TransactionWithRelations>,
): string | null {
  const sample = transactionsById.get(category.transactionIds[0] ?? '');
  if (!sample) return null;
  return (
    (sample.categoryId === category.id ? sample.categoryName : sample.categoryParentName) ?? null
  );
}

function CoversCard({
  categories,
  categoriesById,
  transactionsById,
  styleByKey,
  settings,
  onOpenCategory,
}: {
  categories: HouseholdCategory[];
  categoriesById: Map<string, Category>;
  transactionsById: Map<string, TransactionWithRelations>;
  styleByKey: Map<string, PersonStyle>;
  settings: UserSettings;
  onOpenCategory: (category: HouseholdCategory, name: string) => void;
}) {
  const themeColors = useThemeColors();
  if (categories.length === 0) return null;
  const top = categories[0]!.amount;
  return (
    <InsightCard title={I18n.t('household.who_covers')}>
      <View className="gap-3.5">
        {categories.map((category) => {
          const isUncategorized = category.id === UNCATEGORIZED_ID;
          const record = isUncategorized ? undefined : categoriesById.get(category.id);
          const name =
            record?.name ??
            (isUncategorized ? null : nameFromEntries(category, transactionsById)) ??
            String(I18n.t('common.uncategorized'));
          const parts = category.byPerson
            .map((part) => {
              const style = styleByKey.get(part.personKey);
              return style
                ? `${style.person.name} ${percentLabel(part.amount / category.amount)}`
                : null;
            })
            .filter(Boolean)
            .join(', ');
          return (
            <Pressable
              key={category.id}
              onPress={() => onOpenCategory(category, name)}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${money(category.amount, settings)}. ${parts}`}
              className="flex-row items-center gap-3 active:opacity-70"
            >
              <CategoryTile category={record} />
              <View className="min-w-0 flex-1">
                <View className="flex-row items-baseline gap-2">
                  <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
                    {name}
                  </Text>
                  <Text variant="bodyStrong">{money(category.amount, settings)}</Text>
                </View>
                <View className="mt-1.5">
                  <ShareBar
                    parts={category.byPerson}
                    styleByKey={styleByKey}
                    widthRatio={top > 0 ? category.amount / top : 0}
                    height={7}
                  />
                </View>
              </View>
              <ChevronRight size={14} color={themeColors.textMuted} />
            </Pressable>
          );
        })}
      </View>
    </InsightCard>
  );
}

function TrendCard({
  month,
  styleByKey,
  settings,
  onSelectMonth,
}: {
  month: HouseholdMonth;
  styleByKey: Map<string, PersonStyle>;
  settings: UserSettings;
  /** Opens a month's page; null for a month the pager does not have. */
  onSelectMonth: (monthKey: string) => (() => void) | null;
}) {
  const themeColors = useThemeColors();
  const peak = month.trend.reduce((max, entry) => Math.max(max, entry.total), 0);
  if (peak <= 0) return null;
  // Headroom, so the tallest bar does not touch the card's edge.
  const ceiling = peak * 1.1;
  // The other months in one quiet colour: six people's colours on every bar
  // were a muddle, and the shown month already breaks its people down.
  const pastColor = withColorAlpha(themeColors.textMuted, 0.28);
  return (
    <InsightCard title={I18n.t('household.trend')}>
      <View style={styles.trendBars} {...REPLAY_PRIVATE}>
        {month.trend.map((entry) => {
          const isShown = entry.monthKey === month.monthKey;
          const barHeight =
            entry.total > 0 ? Math.max(4, (entry.total / ceiling) * TREND_HEIGHT) : 0;
          const label = monthNameLabel(entry.monthKey, settings.locale, 'short');
          const open = isShown ? null : onSelectMonth(entry.monthKey);
          return (
            <Pressable
              key={entry.monthKey}
              style={styles.trendColumn}
              onPress={open ?? undefined}
              disabled={!open}
              accessibilityRole={open ? 'button' : undefined}
              accessibilityLabel={`${label}: ${money(entry.total, settings)}`}
              accessibilityState={{ selected: isShown }}
            >
              <View
                style={[
                  styles.trendBar,
                  { height: barHeight, backgroundColor: isShown ? undefined : pastColor },
                ]}
              >
                {/* The shown month stacked bottom-up in the page's order of people. */}
                {isShown
                  ? month.people
                      .filter((part) => part.amount > 0)
                      .reverse()
                      .map((part) => (
                        <View
                          key={part.personKey}
                          style={{
                            flex: part.amount / entry.total,
                            backgroundColor:
                              styleByKey.get(part.personKey)?.person.color ?? themeColors.textMuted,
                          }}
                        />
                      ))
                  : null}
              </View>
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: isShown ? themeColors.text : themeColors.textMuted }}
                className={isShown ? 'font-semibold' : undefined}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </InsightCard>
  );
}

function BiggestCard({
  month,
  transactionsById,
  categoriesById,
  styleByKey,
  settings,
  onOpenTransaction,
}: {
  month: HouseholdMonth;
  transactionsById: Map<string, TransactionWithRelations>;
  categoriesById: Map<string, Category>;
  styleByKey: Map<string, PersonStyle>;
  settings: UserSettings;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
}) {
  if (month.biggest.length === 0) return null;
  return (
    <InsightCard title={I18n.t('household.biggest')}>
      <View className="gap-3">
        {month.biggest.map((entry) => {
          const transaction = transactionsById.get(entry.transactionId);
          const category = entry.categoryId ? categoriesById.get(entry.categoryId) : undefined;
          // The entry's own category name too, as on Review: it outlives a deleted category.
          const title =
            transaction?.note?.trim() ||
            category?.name ||
            transaction?.categoryName ||
            I18n.t('common.uncategorized');
          const style = styleByKey.get(entry.personKey);
          return (
            <Pressable
              key={entry.transactionId}
              onPress={
                transaction
                  ? () => {
                      void triggerHaptic('selection');
                      onOpenTransaction(transaction);
                    }
                  : undefined
              }
              accessibilityRole="button"
              className="flex-row items-center gap-3 active:opacity-70"
            >
              <CategoryTile category={category} />
              <View className="min-w-0 flex-1">
                <Text variant="body" numberOfLines={1}>
                  {title}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {style
                    ? `${shortDayLabel(entry.dayKey, settings.locale)} · ${style.label}`
                    : shortDayLabel(entry.dayKey, settings.locale)}
                </Text>
              </View>
              {style ? <PersonAvatar person={style.person} size={22} /> : null}
              <Text variant="bodyStrong">{money(entry.amount, settings)}</Text>
            </Pressable>
          );
        })}
      </View>
    </InsightCard>
  );
}

const styles = StyleSheet.create({
  quiet: {
    opacity: 0.55,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  cardStack: {
    gap: spacing.sm,
  },
  trendBars: {
    height: TREND_HEIGHT + 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  trendColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  trendBar: {
    width: '100%',
    maxWidth: 28,
    overflow: 'hidden',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
});
