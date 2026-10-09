// Fixed inputs shared by every case.
//
// REFERENCE_DATE is the "today" the whole dataset is written against: receipt
// dates sit a few days to weeks before it, and the Worker's date clamp (30 days
// back / 2 ahead) is evaluated against it rather than the wall clock. That
// keeps the dataset byte-identical across rebuilds and its answer key valid
// forever, instead of every in-window date going stale a month after a build.
export const REFERENCE_DATE = '2026-10-01';
export const REFERENCE_NOW = new Date(`${REFERENCE_DATE}T09:00:00Z`);

/** "Today" for one case: real photos carry their own reference date (see dataset/real/README.md). */
export const nowFor = (kase) =>
  kase.referenceDate ? new Date(`${kase.referenceDate}T09:00:00Z`) : REFERENCE_NOW;

// The Worker's own fallback list, i.e. a fresh install in English.
export const CAT_DEFAULT = [
  'Food',
  'Groceries',
  'Transport',
  'Housing',
  'Bills',
  'Healthcare',
  'Shopping',
  'Other',
];

// The app sends every expense category, parents and children alike.
export const CAT_NESTED = [
  'Food',
  'Dining out',
  'Coffee',
  'Groceries',
  'Transport',
  'Fuel',
  'Taxi & rideshare',
  'Parking',
  'Bills',
  'Electricity',
  'Internet',
  'Phone',
  'Healthcare',
  'Pharmacy',
  'Shopping',
  'Clothing',
  'Electronics',
  'Home',
  'Entertainment',
  'Subscriptions',
  'Travel',
  'Gifts',
  'Other',
];

// A Malaysian user who renamed and added categories.
export const CAT_MY_CUSTOM = [
  'Makan',
  'Coffee',
  'Groceries',
  'Petrol',
  'Parking & Toll',
  'Grab',
  'Utilities',
  'Phone & Internet',
  'Clinic & Pharmacy',
  'Kids',
  'Shopping',
  'Gifts',
  'Other',
];

// Localized defaults: category names must come back exactly, script included.
export const CAT_JA = [
  '食費',
  '外食',
  '日用品',
  '交通費',
  '医療費',
  '光熱費',
  '通信費',
  '趣味・娯楽',
  'その他',
];
export const CAT_ID = [
  'Makanan',
  'Belanja Harian',
  'Transportasi',
  'Tagihan',
  'Kesehatan',
  'Belanja',
  'Lainnya',
];
export const CAT_DE = [
  'Lebensmittel',
  'Restaurant',
  'Transport',
  'Wohnen',
  'Gesundheit',
  'Einkaufen',
  'Sonstiges',
];

// Traditional Chinese (zh-Hant locale) defaults.
export const CAT_ZH_HANT = ['餐飲', '超市', '交通', '購物', '醫療', '帳單', '其他'];

// No "Other": the prompt says to fall back to the closest general category.
export const CAT_NO_OTHER = ['Eating out', 'Supermarket', 'Car', 'Home', 'Health', 'Fun'];
