export const SCREENSHOTS = [
  {
    file: "01-home.webp",
    key: "home",
  },
  {
    file: "02-privacy.webp",
    key: "privacy",
  },
  {
    file: "03-accounts.webp",
    key: "assets",
  },
  {
    file: "04-budgeting.webp",
    key: "budgeting",
  },
  {
    file: "05-insights.webp",
    key: "insights",
  },
  {
    file: "06-add-expense.webp",
    key: "addExpense",
  },
  {
    file: "07-recurrings.webp",
    key: "recurrings",
  },
  {
    file: "08-hourly-rates.webp",
    key: "hourlyRates",
  },
  {
    file: "09-split-bill.webp",
    key: "splitBill",
  },
] as const;

export const SCREENSHOT_WIDTH = 1284;
export const SCREENSHOT_HEIGHT = 2778;


/**
 * Which set of app captures a locale shows. The screenshots are of the app's
 * own UI, so the regional English variants share the English set — there is
 * no `media/screenshots/en-my` and there should not be.
 */
export function screenshotLocale(locale: string) {
  return locale.split("-")[0];
}
