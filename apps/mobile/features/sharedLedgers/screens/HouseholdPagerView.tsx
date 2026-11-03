import { ChevronRight } from 'lucide-react-native';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { MonthYearWheelPicker } from '~/components/datePicker';
import { yearMonthFromKey, yearMonthToKey } from '~/components/datePicker/monthJump';
import { EmptyState } from '~/components/feedback/EmptyState';
import { useContentFrame } from '~/components/layout/ContentFrame';
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
import { monthKeyLabel } from '~/features/budget/lib/format';
import { InsightCard, SpendDeltaPill } from '~/features/insights/components/InsightCard';
import type { InsightsDrilldownPayload } from '~/features/insights/screens/InsightsDrilldownScreen';
import { filterSpendingTransactions } from '~/features/reimbursements/lib/reimbursementMath';
import { money, shortDayLabel } from '~/features/review/lib/reviewFormat';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, TransactionWithRelations, UserSettings } from '~/types';
import { withColorAlpha } from '~/utils/color';
import { financialMonthKeyForDate, monthCycleOf } from '~/utils/financialMonth';
import { parseMonthKey } from '~/utils/formatters';
import { toSpendingRows } from '~/utils/spending';

import { PersonAvatar } from '../components/PersonAvatar';
import {
  buildHouseholdIndex,
  buildHouseholdMonth,
  buildPeopleStyles,
  HOUSEHOLD_UNCATEGORIZED,
  type HouseholdCategory,
  type HouseholdMonth,
  householdPagerMonths,
  OWNER_KEY,
  type PersonAmount,
  personKey,
  type PersonStyle,
} from '../lib/householdMath';
import { useOpenLedgerPeople } from '../lib/ledgerPeople';

export interface HouseholdPagerViewHandle {
  scrollToRelative: (direction: 1 | -1) => void;
  /** Open the month wheel, for the host header's month label. */
  openMonthPicker: () => void;
}

interface HouseholdPagerViewProps {
  /** Opens the transactions behind a person or a category. */
  onOpenDrilldown: (payload: InsightsDrilldownPayload) => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  /** Reports the shown month's label, so the host header can show it. */
  onActiveMonthLabelChange?: (label: string) => void;
}

const TREND_HEIGHT = 108;

const shortMonthFormatters = new Map<string, Intl.DateTimeFormat>();

/** 'YYYY-MM' → "Oct", for the trend's columns. */
function shortMonthLabel(monthKey: string, locale: string): string {
  let formatter = shortMonthFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    shortMonthFormatters.set(locale, formatter);
  }
  return formatter.format(parseMonthKey(monthKey) ?? new Date());
}

function percentLabel(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * The Household insights page of a shared ledger: one page per month, each
 * a stack of cards about the people in it (README.md > Shared ledgers >
 * Household insights). Embedded in Insights, which shows it only while the
 * open ledger is shared.
 */
export const HouseholdPagerView = forwardRef<HouseholdPagerViewHandle, HouseholdPagerViewProps>(
  function HouseholdPagerViewImpl(
    { onOpenDrilldown, onOpenTransaction, onActiveMonthLabelChange },
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
    // left), each with a colour no one else on the page has, kept the same on
    // every month's page.
    const { peopleOrder, styleByKey } = useMemo(
      () => buildPeopleStyles(people, index.months.values()),
      [index, people],
    );

    const currentMonthKey = financialMonthKeyForDate(new Date(), monthCycle);
    const monthsRef = useRef<string[]>([]);
    const months = useMemo(() => {
      const next = householdPagerMonths(index.firstMonthKey, currentMonthKey, monthCycle);
      const previous = monthsRef.current;
      if (next.length === previous.length && next.every((month, i) => month === previous[i])) {
        return previous;
      }
      monthsRef.current = next;
      return next;
    }, [currentMonthKey, index.firstMonthKey, monthCycle]);

    const listRef = useRef<FlatList<number>>(null);
    const pager = useMonthPager({
      listRef,
      pageWidth,
      totalSlots: months.length,
      initialIndex: months.length - 1,
    });

    const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
    useImperativeHandle(
      ref,
      () => ({
        scrollToRelative: pager.scrollToRelative,
        openMonthPicker: () => setIsMonthPickerOpen(true),
      }),
      [pager.scrollToRelative],
    );

    // `months` can gain leading entries while mounted (a backdated entry, a
    // sync): stay on the month being viewed rather than the same slot. Before
    // paint, so the slot's other month never flashes.
    const previousMonthsRef = useRef(months);
    useLayoutEffect(() => {
      const previousMonths = previousMonthsRef.current;
      if (previousMonths === months) return;
      previousMonthsRef.current = months;
      const viewed = previousMonths[pager.activeIndexRef.current];
      if (!viewed) return;
      let nextIndex = months.indexOf(viewed);
      if (nextIndex < 0) {
        const nearest = months.findIndex((month) => month >= viewed);
        nextIndex = nearest >= 0 ? nearest : months.length - 1;
      }
      if (nextIndex === pager.activeIndexRef.current) return;
      pager.setActiveIndex(nextIndex);
      listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated: false });
    }, [months, pageWidth, pager]);

    const activeMonth = months[pager.activeIndex] ?? months[months.length - 1]!;
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
            monthCycle,
            peopleOrder,
            categories,
            personKeyOf,
          });
          built.set(monthKey, month);
        }
        return month;
      };
    }, [categories, index, monthCycle, peopleOrder, personKeyOf]);

    // A tap on another month's bar in the trend opens that month's page.
    const { jumpToIndex } = pager;
    const selectMonth = useCallback(
      (monthKey: string) => {
        const target = months.indexOf(monthKey);
        if (target < 0) return null;
        return () => {
          void triggerHaptic('selection');
          jumpToIndex(target);
        };
      },
      [jumpToIndex, months],
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
          <View style={{ width: pageWidth }} className="flex-1">
            <ScrollView
              contentContainerStyle={[styles.content, listNavInset]}
              showsVerticalScrollIndicator={false}
            >
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
                        I18n.t('household.person_month', { name: style.person.name, month: label }),
                        month.transactionIdsByPerson.get(personKey(style.person)) ?? [],
                      )
                    }
                  />
                  <CoversCard
                    categories={month.categories}
                    categoriesById={categoriesById}
                    styleByKey={styleByKey}
                    settings={settings}
                    onOpenCategory={(category, name) => openIds(name, category.transactionIds)}
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

    const activeYearMonth = yearMonthFromKey(activeMonth);
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
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={3}
          className="flex-1"
        />

        <MonthYearWheelPicker
          visible={isMonthPickerOpen}
          year={activeYearMonth.year}
          monthIndex={activeYearMonth.monthIndex}
          // The pager runs from the first month with spending to this one.
          min={yearMonthFromKey(months[0]!)}
          max={yearMonthFromKey(months[months.length - 1]!)}
          locale={settings.locale}
          onSelect={(year, monthIndex) => {
            setIsMonthPickerOpen(false);
            const key = yearMonthToKey({ year, monthIndex });
            const exact = months.indexOf(key);
            const next = exact >= 0 ? exact : months.findIndex((month) => month >= key);
            pager.jumpToIndex(next >= 0 ? next : months.length - 1);
          }}
          onClose={() => setIsMonthPickerOpen(false)}
        />
      </>
    );
  },
);

function styleFor(styleByKey: Map<string, PersonStyle>, key: string): PersonStyle | null {
  return styleByKey.get(key) ?? null;
}

/** A full-width bar split into each person's part, in their colours. */
function ShareBar({
  parts,
  styleByKey,
  widthRatio = 1,
  height,
  dimmed,
}: {
  parts: PersonAmount[];
  styleByKey: Map<string, PersonStyle>;
  widthRatio?: number;
  height: number;
  dimmed?: boolean;
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
            const color = styleFor(styleByKey, part.personKey)?.color ?? '#94A3A0';
            return (
              <View
                key={part.personKey}
                style={{
                  flex: part.amount / total,
                  backgroundColor: dimmed ? withColorAlpha(color, 0.4) : color,
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
              const style = styleFor(styleByKey, part.personKey);
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
                  <PersonAvatar person={style.person} size={30} color={style.color} />
                  {/* A photo hides the person's colour, so the bar's key moves beside it. */}
                  {style.person.avatarFileUri ? (
                    <View
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: style.color }}
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

function CoversCard({
  categories,
  categoriesById,
  styleByKey,
  settings,
  onOpenCategory,
}: {
  categories: HouseholdCategory[];
  categoriesById: Map<string, Category>;
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
          const record =
            category.id === HOUSEHOLD_UNCATEGORIZED ? undefined : categoriesById.get(category.id);
          const name = record?.name ?? String(I18n.t('common.uncategorized'));
          const parts = category.byPerson
            .map((part) => {
              const style = styleFor(styleByKey, part.personKey);
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
          const label = shortMonthLabel(entry.monthKey, settings.locale);
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
                  ? [...entry.byPerson].reverse().map((part) => (
                      <View
                        key={part.personKey}
                        style={{
                          flex: part.amount / entry.total,
                          backgroundColor:
                            styleFor(styleByKey, part.personKey)?.color ?? themeColors.textMuted,
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
          const title =
            transaction?.note?.trim() || category?.name || I18n.t('common.uncategorized');
          const style = styleFor(styleByKey, entry.personKey);
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
              {style ? <PersonAvatar person={style.person} size={22} color={style.color} /> : null}
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
