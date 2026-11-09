/*
 * What the free plan allows, as the app's constants/proLimits.ts has it
 * (PRO_LIMITS, under the same names). The phone checks every change against
 * its own copy and refuses one past a limit with `pro_required`; the dashboard
 * checks first only so the paywall opens before a form is filled in, as the
 * app's add buttons do. Keep these in step with the app.
 */

export const FREE_MAX_ACCOUNTS = 6;
export const FREE_MAX_CATEGORIES = 9;
export const FREE_MAX_RECURRING_RULES = 5;
export const FREE_MAX_WAGE_ENTRIES = 5;
/** Sub-currencies tracked beside the main one. */
export const FREE_MAX_SUBCURRENCIES = 1;
/** Albums (trips). */
export const FREE_MAX_ALBUMS = 3;
/** Cost-per-day items. */
export const FREE_MAX_ITEMS = 5;
export const FREE_MAX_BUDGET_TEMPLATES = 1;
/** Savings goals that are not archived. */
export const FREE_MAX_SAVINGS_GOALS = 2;
/** Loans that are not archived. */
export const FREE_MAX_LOANS = 1;
/** Split bills with a friend's share still owed, counted per transaction. */
export const FREE_MAX_UNSETTLED_SPLIT_BILLS = 3;
