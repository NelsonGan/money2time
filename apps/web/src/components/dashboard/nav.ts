/**
 * Every page in the sidebar, in order, grouped as it is drawn: the everyday
 * pages first (no heading), then what the money says, what you have, what is
 * planned, and how it is organized.
 */
export const NAV = [
  {
    group: "home",
    items: [
      { id: "overview", icon: "nav/home-active" },
      { id: "transactions", icon: "money-time/receipt" },
      { id: "calendar", icon: "insights/calendar-clock" },
    ],
  },
  {
    group: "insights",
    items: [
      { id: "cash-flow", icon: "money-time/bar-chart" },
      { id: "spending", icon: "money-time/wallet-out" },
      { id: "income", icon: "money-time/wallet-in" },
      { id: "trends", icon: "money-time/chart-up" },
      { id: "time", icon: "money-time/hourglass" },
      { id: "mood", icon: "insights/mood-faces" },
    ],
  },
  {
    group: "wealth",
    items: [
      { id: "accounts", icon: "settings/accounts" },
      { id: "net-worth", icon: "insights/growth-analysis" },
      { id: "goals", icon: "status/goal-target" },
      { id: "splits", icon: "settings/settle-up" },
    ],
  },
  {
    group: "planning",
    items: [
      { id: "budgets", icon: "settings/budget" },
      { id: "recurring", icon: "settings/recurring" },
    ],
  },
  {
    group: "organize",
    items: [
      { id: "categories", icon: "settings/categories" },
      { id: "trips", icon: "settings/albums" },
      { id: "items", icon: "settings/items" },
    ],
  },
] as const;

export type ViewId = (typeof NAV)[number]["items"][number]["id"];

export const VIEW_IDS: ViewId[] = NAV.flatMap((group) => group.items.map((item) => item.id));

export function isViewId(value: string): value is ViewId {
  return (VIEW_IDS as string[]).includes(value);
}

/** Views whose figures do not depend on the period picker. */
export const PERIODLESS: ViewId[] = ["categories", "accounts", "goals", "items", "splits", "recurring", "trips"];
