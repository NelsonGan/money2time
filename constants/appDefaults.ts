import type { Account, AccountType, Category, TransactionFilters, WageConfig } from '~/types';

export const DEFAULT_WAGE_CONFIG: WageConfig = {
  wageType: 'monthly',
  wageAmount: 0,
  hoursWorkedPerWeek: 40,
  workdaysPerWeek: 5,
  commuteMinutesPerWorkday: 0,
};

export const DEFAULT_TRANSACTION_FILTERS: TransactionFilters = {
  search: '',
  dateRange: null,
  accountId: null,
  excludedAccountIds: [],
  type: 'all',
  incomeCategoryId: null,
  expenseCategoryId: null,
  excludedIncomeCategoryIds: [],
  excludedExpenseCategoryIds: [],
  categoryId: null,
  minAmount: null,
  maxAmount: null,
  sortBy: 'date_desc',
};

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_CURRENCY_SYMBOL = '$';

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string; icon: string }[] = [
  { value: 'debit', label: 'Debit', icon: '🏦' },
  { value: 'credit', label: 'Credit', icon: '💳' },
  { value: 'loan', label: 'Loan', icon: '🧾' },
];

export const DEFAULT_ACCOUNT_TEMPLATE: Omit<
  Account,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt'
> = {
  name: 'Main Account',
  type: 'debit',
  accountGroup: null,
  creditStatementDay: null,
  creditDueDay: null,
  currency: DEFAULT_CURRENCY,
  startingBalance: 0,
  includeInTotals: true,
};

/**
 * Curated common-first order of bundled icon ids, used as the default pick for
 * a new category and as the random fallback when importing data that carries no
 * icon. Ids only: the emoji glyphs these replaced now live in
 * LEGACY_EMOJI_TO_ICON (lib/db/normalizeIcons.ts) purely for reading old data.
 */
export const DEFAULT_CATEGORY_ICONS = [
  'meal',
  'grocery-basket',
  'car',
  'house',
  'laptop',
  'medicine',
  'game-controller',
  'clapperboard',
  'graduation-cap',
  'dumbbell',
  'camper-van',
  'plane',
  'dog',
  'balloon',
  't-shirt',
  'light-bulb',
  'alcohol',
  'coffee',
  'briefcase',
  'cash',
  'gift',
  'coins',
  'bank',
  'invoice',
  'bill-calendar',
  'shopping-bag',
  'faucet',
  'stethoscope',
  'price-tag',
  'target',
];

export const MAJOR_CURRENCIES: { code: string; symbol: string; name: string }[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'MOP', symbol: 'MOP$', name: 'Macanese Pataca' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
];

/**
 * Every currency we carry name/symbol metadata for: {@link MAJOR_CURRENCIES}
 * plus every remaining currency the Frankfurter v2 feed quotes, so the full
 * picker and the auto-rate set line up. Used by the currency pickers and by
 * `currencySymbolForCode` / `currencyNameForCode`.
 *
 * Mirrors `GET /v2/currencies` minus two groups that are quoted but are not
 * money anyone spends: the metals and the IMF unit (XAU, XAG, XPT, XPD, XDR),
 * and codes that would show up as a second row for a currency already listed
 * (MRO, superseded by MRU in the 2018 redenomination; ANG, superseded by XCG in
 * 2025 and sharing its ISO numeric 532; CNH, offshore CNY and not an ISO 4217
 * currency).
 *
 * Symbols come from the feed only where the glyph is unambiguous. Where a feed
 * symbol is already spoken for or is claimed by several currencies at once (a
 * bare `$` covers 21 of them, `£` seven, `Fr` five), the entry falls back to its
 * ISO code, since `formatAmount` renders this string verbatim and "$100" must
 * not be able to mean twenty-one different things. Collisions are judged
 * ignoring case and punctuation, so BOB `Bs.` does not sit next to VES `Bs`,
 * nor KGS `som` next to UZS `so'm`; `CFA` is spelled out as its code too, since
 * both XAF and XOF are called the CFA franc.
 */
export const ALL_CURRENCIES: { code: string; symbol: string; name: string }[] = [
  ...MAJOR_CURRENCIES,
  { code: 'AFN', symbol: '؋', name: 'Afghan Afghani' },
  { code: 'ALL', symbol: 'ALL', name: 'Albanian Lek' },
  { code: 'AMD', symbol: '֏', name: 'Armenian Dram' },
  { code: 'AOA', symbol: 'Kz', name: 'Angolan Kwanza' },
  { code: 'ARS', symbol: 'ARS', name: 'Argentine Peso' },
  { code: 'AWG', symbol: 'ƒ', name: 'Aruban Florin' },
  { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat' },
  { code: 'BAM', symbol: 'КМ', name: 'Bosnia and Herzegovina Convertible Mark' },
  { code: 'BBD', symbol: 'BBD', name: 'Barbadian Dollar' },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
  { code: 'BHD', symbol: 'د.ب', name: 'Bahraini Dinar' },
  { code: 'BIF', symbol: 'BIF', name: 'Burundian Franc' },
  { code: 'BMD', symbol: 'BMD', name: 'Bermudian Dollar' },
  { code: 'BND', symbol: 'BND', name: 'Brunei Dollar' },
  { code: 'BOB', symbol: 'BOB', name: 'Bolivian Boliviano' },
  { code: 'BSD', symbol: 'BSD', name: 'Bahamian Dollar' },
  { code: 'BTN', symbol: 'Nu.', name: 'Bhutanese Ngultrum' },
  { code: 'BWP', symbol: 'P', name: 'Botswana Pula' },
  { code: 'BYN', symbol: 'BYN', name: 'Belarusian Ruble' },
  { code: 'BZD', symbol: 'BZD', name: 'Belize Dollar' },
  { code: 'CDF', symbol: 'CDF', name: 'Congolese Franc' },
  { code: 'CLP', symbol: 'CLP', name: 'Chilean Peso' },
  { code: 'COP', symbol: 'COP', name: 'Colombian Peso' },
  { code: 'CRC', symbol: 'CRC', name: 'Costa Rican Colón' },
  { code: 'CUP', symbol: 'CUP', name: 'Cuban Peso' },
  { code: 'CVE', symbol: 'CVE', name: 'Cape Verdean Escudo' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'DJF', symbol: 'Fdj', name: 'Djiboutian Franc' },
  { code: 'DOP', symbol: 'DOP', name: 'Dominican Peso' },
  { code: 'DZD', symbol: 'د.ج', name: 'Algerian Dinar' },
  { code: 'EGP', symbol: 'ج.م', name: 'Egyptian Pound' },
  { code: 'ERN', symbol: 'Nfk', name: 'Eritrean Nakfa' },
  { code: 'ETB', symbol: 'ETB', name: 'Ethiopian Birr' },
  { code: 'FJD', symbol: 'FJD', name: 'Fijian Dollar' },
  { code: 'FKP', symbol: 'FKP', name: 'Falkland Pound' },
  { code: 'GEL', symbol: '₾', name: 'Georgian Lari' },
  { code: 'GGP', symbol: 'GGP', name: 'Guernsey Pound' },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi' },
  { code: 'GIP', symbol: 'GIP', name: 'Gibraltar Pound' },
  { code: 'GMD', symbol: 'D', name: 'Gambian Dalasi' },
  { code: 'GNF', symbol: 'GNF', name: 'Guinean Franc' },
  { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal' },
  { code: 'GYD', symbol: 'GYD', name: 'Guyanese Dollar' },
  { code: 'HNL', symbol: 'HNL', name: 'Honduran Lempira' },
  { code: 'HTG', symbol: 'G', name: 'Haitian Gourde' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'ILS', symbol: '₪', name: 'Israeli New Shekel' },
  { code: 'IMP', symbol: 'IMP', name: 'Isle of Man Pound' },
  { code: 'IQD', symbol: 'ع.د', name: 'Iraqi Dinar' },
  { code: 'IRR', symbol: 'IRR', name: 'Iranian Rial' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna' },
  { code: 'JEP', symbol: 'JEP', name: 'Jersey Pound' },
  { code: 'JMD', symbol: 'JMD', name: 'Jamaican Dollar' },
  { code: 'JOD', symbol: 'د.ا', name: 'Jordanian Dinar' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'KGS', symbol: 'KGS', name: 'Kyrgyzstani Som' },
  { code: 'KHR', symbol: '៛', name: 'Cambodian Riel' },
  { code: 'KMF', symbol: 'KMF', name: 'Comorian Franc' },
  { code: 'KPW', symbol: 'KPW', name: 'North Korean Won' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  { code: 'KYD', symbol: 'KYD', name: 'Cayman Islands Dollar' },
  { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge' },
  { code: 'LAK', symbol: '₭', name: 'Lao Kip' },
  { code: 'LBP', symbol: 'ل.ل', name: 'Lebanese Pound' },
  { code: 'LKR', symbol: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'LRD', symbol: 'LRD', name: 'Liberian Dollar' },
  { code: 'LSL', symbol: 'LSL', name: 'Lesotho Loti' },
  { code: 'LYD', symbol: 'ل.د', name: 'Libyan Dinar' },
  { code: 'MAD', symbol: 'د.م.', name: 'Moroccan Dirham' },
  { code: 'MDL', symbol: 'MDL', name: 'Moldovan Leu' },
  { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary' },
  { code: 'MKD', symbol: 'ден', name: 'Macedonian Denar' },
  { code: 'MMK', symbol: 'MMK', name: 'Myanmar Kyat' },
  { code: 'MNT', symbol: '₮', name: 'Mongolian Tögrög' },
  { code: 'MRU', symbol: 'UM', name: 'Mauritanian Ouguiya' },
  { code: 'MUR', symbol: 'MUR', name: 'Mauritian Rupee' },
  { code: 'MVR', symbol: 'MVR', name: 'Maldivian Rufiyaa' },
  { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha' },
  { code: 'MZN', symbol: 'MTn', name: 'Mozambican Metical' },
  { code: 'NAD', symbol: 'NAD', name: 'Namibian Dollar' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'NIO', symbol: 'NIO', name: 'Nicaraguan Córdoba' },
  { code: 'NPR', symbol: 'Rs.', name: 'Nepalese Rupee' },
  { code: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial' },
  { code: 'PAB', symbol: 'B/.', name: 'Panamanian Balboa' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol' },
  { code: 'PGK', symbol: 'PGK', name: 'Papua New Guinean Kina' },
  { code: 'PYG', symbol: '₲', name: 'Paraguayan Guaraní' },
  { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'RSD', symbol: 'RSD', name: 'Serbian Dinar' },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc' },
  { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
  { code: 'SBD', symbol: 'SBD', name: 'Solomon Islands Dollar' },
  { code: 'SCR', symbol: 'SCR', name: 'Seychellois Rupee' },
  { code: 'SDG', symbol: 'SDG', name: 'Sudanese Pound' },
  { code: 'SHP', symbol: 'SHP', name: 'Saint Helenian Pound' },
  { code: 'SLE', symbol: 'Le', name: 'New Leone' },
  { code: 'SOS', symbol: 'SOS', name: 'Somali Shilling' },
  { code: 'SRD', symbol: 'SRD', name: 'Surinamese Dollar' },
  { code: 'SSP', symbol: 'SSP', name: 'South Sudanese Pound' },
  { code: 'STN', symbol: 'Db', name: 'São Tomé and Príncipe Second Dobra' },
  { code: 'SVC', symbol: 'SVC', name: 'Salvadoran Colón' },
  { code: 'SYP', symbol: '£S', name: 'Syrian Pound' },
  { code: 'SZL', symbol: 'E', name: 'Swazi Lilangeni' },
  { code: 'TJS', symbol: 'ЅМ', name: 'Tajikistani Somoni' },
  { code: 'TMT', symbol: 'TMT', name: 'Turkmenistani Manat' },
  { code: 'TND', symbol: 'د.ت', name: 'Tunisian Dinar' },
  { code: 'TOP', symbol: 'T$', name: 'Tongan Paʻanga' },
  { code: 'TTD', symbol: 'TTD', name: 'Trinidad and Tobago Dollar' },
  { code: 'TZS', symbol: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso' },
  { code: 'UZS', symbol: 'UZS', name: 'Uzbekistan Som' },
  { code: 'VES', symbol: 'VES', name: 'Venezuelan Bolívar Soberano' },
  { code: 'VUV', symbol: 'Vt', name: 'Vanuatu Vatu' },
  { code: 'WST', symbol: 'T', name: 'Samoan Tala' },
  { code: 'XAF', symbol: 'XAF', name: 'Central African CFA Franc' },
  { code: 'XCD', symbol: 'XCD', name: 'East Caribbean Dollar' },
  { code: 'XCG', symbol: 'Cg', name: 'Caribbean Guilder' },
  { code: 'XOF', symbol: 'XOF', name: 'West African CFA Franc' },
  { code: 'XPF', symbol: '₣', name: 'CFP Franc' },
  { code: 'YER', symbol: 'YER', name: 'Yemeni Rial' },
  { code: 'ZMW', symbol: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'ZWG', symbol: 'ZiG', name: 'Zimbabwe Gold' },
];

type OnboardingCategorySeed = Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;
type OnboardingAccountSeed = Omit<
  Account,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'currency'
>;

export const ONBOARDING_MINIMAL_EXPENSE_CATEGORIES: OnboardingCategorySeed[] = [
  { name: 'Food', type: 'expense', parentId: null, icon: 'meal', isDefault: true },
  { name: 'Groceries', type: 'expense', parentId: null, icon: 'grocery-basket', isDefault: true },
  { name: 'Transport', type: 'expense', parentId: null, icon: 'car', isDefault: true },
  { name: 'Housing', type: 'expense', parentId: null, icon: 'house', isDefault: true },
  { name: 'Bills', type: 'expense', parentId: null, icon: 'light-bulb', isDefault: true },
  { name: 'Healthcare', type: 'expense', parentId: null, icon: 'medicine', isDefault: true },
  { name: 'Shopping', type: 'expense', parentId: null, icon: 'shopping-bag', isDefault: true },
  { name: 'Other', type: 'expense', parentId: null, icon: 'invoice', isDefault: true },
];

export const ONBOARDING_MINIMAL_INCOME_CATEGORIES: OnboardingCategorySeed[] = [
  { name: 'Salary', type: 'income', parentId: null, icon: 'cash', isDefault: true },
  { name: 'Other', type: 'income', parentId: null, icon: 'invoice', isDefault: true },
];

export const ONBOARDING_POWER_DEFAULT_GROUPS = ['Cash', 'Bank Accounts', 'Credit Cards'] as const;

export const ONBOARDING_POWER_MINIMAL_ACCOUNTS: OnboardingAccountSeed[] = [
  {
    name: 'Cash Wallet',
    type: 'debit',
    accountGroup: 'Cash',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Digital Wallet',
    type: 'debit',
    accountGroup: 'Cash',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Checking Account',
    type: 'debit',
    accountGroup: 'Bank Accounts',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Savings Account',
    type: 'debit',
    accountGroup: 'Bank Accounts',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
  {
    name: 'Credit Card',
    type: 'credit',
    accountGroup: 'Credit Cards',
    creditStatementDay: null,
    creditDueDay: null,
    startingBalance: 0,
    includeInTotals: true,
  },
];
