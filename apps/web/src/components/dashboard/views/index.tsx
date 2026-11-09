"use client";

import { memo } from "react";

import type { ViewId } from "../nav";
import { CalendarView } from "./calendar";
import { CashFlowView } from "./cash-flow";
import { CategoriesView } from "./categories";
import { ItemsView, MoodView, SplitsView, TimeView, TripsView } from "./life";
import { OverviewView } from "./overview";
import { BudgetsView, GoalsView, RecurringView } from "./plans";
import { BreakdownView, SpendingView } from "./spending";
import { TransactionsView } from "./transactions";
import { TrendsView } from "./trends";
import { AccountsView, NetWorthView } from "./wealth";

function IncomeView() {
  return <BreakdownView kind="earning" />;
}

const VIEWS: Record<ViewId, () => React.JSX.Element> = {
  overview: OverviewView,
  "cash-flow": CashFlowView,
  spending: SpendingView,
  income: IncomeView,
  trends: TrendsView,
  calendar: CalendarView,
  transactions: TransactionsView,
  categories: CategoriesView,
  accounts: AccountsView,
  "net-worth": NetWorthView,
  budgets: BudgetsView,
  recurring: RecurringView,
  goals: GoalsView,
  time: TimeView,
  trips: TripsView,
  items: ItemsView,
  splits: SplitsView,
  mood: MoodView,
};

/** Redraws only when the dashboard's data or settings change, not on a page switch. */
export const ViewSwitch = memo(function ViewSwitch({ view }: { view: ViewId }) {
  const View = VIEWS[view];
  return <View />;
});
