import {
  ACCOUNT_LOGO_COUNTRIES,
  type AccountLogoMeta,
  getAccountLogoMeta,
  getLogosForCountry,
} from '~/constants/accountLogos';
import type { AccountType } from '~/types';

/**
 * The onboarding accounts step: a new user taps the wallets, banks and cards
 * they really use and the app creates them with the right logos. The lists are
 * the popular ones in each country the logo set covers, most used first; every
 * other logo is a search away.
 */

/** How many accounts the step creates at most; one under the free plan's six. */
export const MAX_STARTER_ACCOUNTS = 5;

/** The slug of the bucket of international brands (PayPal, Wise, Visa...). */
export const GLOBAL_COUNTRY = 'global';

export type StarterKind = 'cash' | 'wallet' | 'bank' | 'card';

interface CountryStarters {
  wallets: readonly string[];
  banks: readonly string[];
  cards: readonly string[];
}

/**
 * Popular accounts per country, as brand slugs in that country's logo folder
 * or full `global/<slug>` ids. A card entry is the bank's (or network's) credit
 * card. Lists may name a logo that is not shipped; those are dropped.
 */
export const STARTER_ACCOUNT_LISTS: Record<string, CountryStarters> = {
  malaysia: {
    wallets: ['touch-n-go-ewallet', 'grabpay', 'shopeepay', 'boost-bank', 'bigpay'],
    banks: [
      'maybank',
      'cimb',
      'public-bank',
      'rhb-bank',
      'hong-leong-bank',
      'gxbank',
      'ambank',
      'bank-islam',
      'ryt-bank',
      'aeon-bank',
      'uob-malaysia',
      'ocbc-malaysia',
    ],
    cards: [
      'maybank',
      'cimb',
      'public-bank',
      'hong-leong-bank',
      'uob-malaysia',
      'global/american-express',
    ],
  },
  singapore: {
    wallets: ['grabpay', 'shopeepay', 'youtrip', 'global/revolut', 'global/paypal'],
    banks: [
      'dbs-bank',
      'posb',
      'ocbc',
      'uob',
      'maribank',
      'gxs-bank',
      'standard-chartered-singapore',
      'citibank-singapore',
      'hsbc-singapore',
      'maybank-singapore',
      'cimb-singapore',
    ],
    cards: [
      'dbs-bank',
      'ocbc',
      'uob',
      'citibank-singapore',
      'standard-chartered-singapore',
      'global/american-express',
    ],
  },
  'united-states': {
    wallets: ['global/paypal', 'venmo', 'cash-app'],
    banks: [
      'chase',
      'bank-of-america',
      'wells-fargo',
      'capital-one',
      'chime',
      'sofi',
      'pnc-bank',
      'td-bank',
      'navy-federal-credit-union',
      'truist',
      'citizens-bank',
      'fifth-third-bank',
    ],
    cards: [
      'chase',
      'capital-one',
      'global/american-express',
      'discover',
      'bank-of-america',
      'wells-fargo',
    ],
  },
  philippines: {
    wallets: ['gcash', 'maya', 'grabpay-ph', 'shopeepay-philippines'],
    banks: [
      'bdo-unibank',
      'bpi',
      'metrobank',
      'security-bank',
      'unionbank',
      'gotyme-bank',
      'rcbc',
      'pnb',
      'china-bank',
      'tonik',
      'psbank',
      'uniondigital-bank',
    ],
    cards: ['bdo-unibank', 'bpi', 'metrobank', 'security-bank', 'rcbc', 'unionbank'],
  },
  indonesia: {
    wallets: [],
    banks: [
      'bank-central-asia',
      'bank-mandiri',
      'bank-negara-indonesia',
      'bank-jago',
      'bank-syariah-indonesia',
      'cimb-niaga',
      'bank-danamon',
      'jenius',
      'bank-btn',
      'ocbc-indonesia',
      'bank-neo-commerce',
      'bank-mega',
    ],
    cards: [
      'bank-central-asia',
      'bank-mandiri',
      'bank-negara-indonesia',
      'cimb-niaga',
      'bank-danamon',
    ],
  },
  thailand: {
    wallets: ['truemoney', 'shopeepay-thailand'],
    banks: [
      'kasikornbank',
      'bangkok-bank',
      'krungsri',
      'ttb-bank',
      'government-savings-bank',
      'baac',
      'kiatnakin-phatra',
      'ghb',
      'lh-bank',
    ],
    cards: ['kasikornbank', 'bangkok-bank', 'krungsri', 'ttb-bank'],
  },
  vietnam: {
    wallets: ['momo', 'zalopay', 'viettel-money', 'shopeepay-vietnam', 'vnpay'],
    banks: [
      'vietcombank',
      'techcombank',
      'bidv',
      'vietinbank',
      'vpbank',
      'acb',
      'tpbank',
      'sacombank',
      'hdbank',
      'seabank',
      'nam-a-bank',
    ],
    cards: ['vietcombank', 'techcombank', 'vpbank', 'tpbank', 'sacombank'],
  },
  india: {
    wallets: ['paytm', 'phonepe', 'mobikwik', 'bhim'],
    banks: [
      'state-bank-of-india',
      'hdfc-bank',
      'icici-bank',
      'axis-bank',
      'kotak-mahindra-bank',
      'punjab-national-bank',
      'bank-of-baroda',
      'canara-bank',
      'idfc-first-bank',
      'union-bank-of-india',
      'yes-bank',
      'indusind-bank',
    ],
    cards: [
      'hdfc-bank',
      'icici-bank',
      'state-bank-of-india',
      'axis-bank',
      'kotak-mahindra-bank',
      'global/american-express',
    ],
  },
  china: {
    wallets: ['alipay', 'wechat-pay'],
    banks: [
      'icbc',
      'china-construction-bank',
      'agricultural-bank-of-china',
      'bank-of-china',
      'china-merchants-bank',
      'bank-of-communications',
      'postal-savings-bank-of-china',
      'ping-an-bank',
      'industrial-bank',
      'china-citic-bank',
      'webank',
    ],
    cards: [
      'china-merchants-bank',
      'icbc',
      'china-construction-bank',
      'bank-of-china',
      'ping-an-bank',
    ],
  },
  taiwan: {
    wallets: ['line-pay', 'jkopay', 'easycard', 'icash-pay', 'pxpay-plus'],
    banks: [
      'ctbc-bank',
      'cathay-united-bank',
      'esun-bank',
      'fubon-bank',
      'taishin-bank',
      'bank-of-taiwan',
      'first-bank',
      'mega-bank',
      'land-bank-of-taiwan',
      'hua-nan-bank',
      'bank-sinopac',
      'richart',
    ],
    cards: ['ctbc-bank', 'cathay-united-bank', 'esun-bank', 'fubon-bank', 'taishin-bank'],
  },
  japan: {
    wallets: ['paypay', 'merpay', 'waon'],
    banks: [
      'mizuho-bank',
      'japan-post-bank',
      'rakuten-bank',
      'sbi-sumishin-net-bank',
      'resona-bank',
      'paypay-bank',
      'aeon-bank',
    ],
    cards: ['jcb', 'rakuten-bank', 'aeon-bank', 'global/american-express', 'global/visa'],
  },
  'south-korea': {
    wallets: ['toss', 'ssgpay'],
    banks: [
      'kb-kookmin-bank',
      'shinhan-bank',
      'woori-bank',
      'hana-bank',
      'nonghyup-bank',
      'kakaobank',
      'toss-bank',
      'ibk',
      'busan-bank',
    ],
    cards: ['kb-kookmin-bank', 'shinhan-bank', 'hana-bank', 'woori-bank', 'nonghyup-bank'],
  },
  brazil: {
    wallets: ['mercado-pago', 'picpay', 'pagbank'],
    banks: [
      'nubank',
      'banco-do-brasil',
      'bradesco',
      'caixa-economica-federal',
      'santander-brasil',
      'c6-bank',
      'banco-pan',
      'neon',
      'sicoob',
      'sicredi',
      'banco-original',
      'will-bank',
    ],
    cards: ['nubank', 'banco-do-brasil', 'bradesco', 'santander-brasil', 'c6-bank'],
  },
  mexico: {
    wallets: ['mercado-pago', 'global/paypal'],
    banks: [
      'banorte',
      'santander-mexico',
      'nu-mexico',
      'banco-azteca',
      'hsbc-mexico',
      'scotiabank-mexico',
      'inbursa',
      'bancoppel',
      'banbajio',
      'albo',
      'klar',
      'uala',
    ],
    cards: [
      'nu-mexico',
      'banorte',
      'santander-mexico',
      'stori',
      'rappicard',
      'global/american-express',
    ],
  },
  spain: {
    wallets: ['bizum', 'global/paypal', 'global/revolut'],
    banks: [
      'santander',
      'bbva',
      'caixabank',
      'banco-sabadell',
      'bankinter',
      'ing-espana',
      'openbank',
      'unicaja-banco',
      'abanca',
      'kutxabank',
      'imagin',
      'ibercaja',
    ],
    cards: [
      'bbva',
      'santander',
      'caixabank',
      'banco-sabadell',
      'wizink',
      'global/american-express',
    ],
  },
  portugal: {
    wallets: ['mb-way', 'global/revolut', 'global/paypal'],
    banks: [
      'caixa-geral-de-depositos',
      'millennium-bcp',
      'novobanco',
      'santander-portugal',
      'activobank',
      'credito-agricola',
      'bankinter-portugal',
      'banco-ctt',
      'moey',
      'banco-montepio',
    ],
    cards: [
      'caixa-geral-de-depositos',
      'millennium-bcp',
      'santander-portugal',
      'novobanco',
      'cofidis',
    ],
  },
  germany: {
    wallets: ['global/paypal', 'global/revolut', 'global/klarna'],
    banks: [
      'sparkasse',
      'deutsche-bank',
      'commerzbank',
      'ing-deutschland',
      'dkb',
      'postbank',
      'comdirect',
      'global/n26',
      'trade-republic',
      'hypovereinsbank',
      'consorsbank',
      'sparda-bank',
    ],
    cards: ['dkb', 'ing-deutschland', 'sparkasse', 'global/american-express', 'global/mastercard'],
  },
  france: {
    wallets: ['lydia', 'global/paypal', 'global/revolut'],
    banks: [
      'bnp-paribas',
      'credit-agricole',
      'societe-generale',
      'la-banque-postale',
      'credit-mutuel',
      'lcl',
      'boursorama',
      'banque-populaire',
      'hello-bank',
      'fortuneo',
      'nickel',
      'monabanq',
    ],
    cards: [
      'bnp-paribas',
      'credit-agricole',
      'societe-generale',
      'boursorama',
      'global/american-express',
    ],
  },
  italy: {
    wallets: ['satispay', 'postepay', 'hype', 'global/paypal'],
    banks: [
      'intesa-sanpaolo',
      'unicredit',
      'poste-italiane',
      'bper-banca',
      'bnl',
      'finecobank',
      'banca-mediolanum',
      'credem',
      'banca-sella',
      'illimity',
      'widiba',
    ],
    cards: ['nexi', 'intesa-sanpaolo', 'unicredit', 'buddybank', 'global/american-express'],
  },
  netherlands: {
    wallets: ['tikkie', 'global/paypal', 'global/revolut'],
    banks: [
      'ing',
      'rabobank',
      'abn-amro',
      'sns',
      'asn-bank',
      'bunq',
      'knab',
      'triodos-bank',
      'regiobank',
    ],
    cards: ['ing', 'rabobank', 'abn-amro', 'global/american-express'],
  },
  denmark: {
    wallets: ['mobilepay'],
    banks: [
      'danske-bank',
      'nordea',
      'jyske-bank',
      'sydbank',
      'nykredit',
      'arbejdernes-landsbank',
      'spar-nord',
      'lunar',
      'coop-bank',
    ],
    cards: ['danske-bank', 'nordea', 'jyske-bank', 'lunar'],
  },
  norway: {
    wallets: ['global/revolut', 'global/paypal'],
    banks: [
      'dnb',
      'sparebank-1',
      'nordea-norge',
      'handelsbanken',
      'danske-bank',
      'sbanken',
      'storebrand',
      'sparebanken-vest',
      'bn-bank',
    ],
    cards: ['bank-norwegian', 'dnb', 'sparebank-1', 'instabank'],
  },
  sweden: {
    wallets: ['global/klarna', 'global/paypal', 'global/revolut'],
    banks: [
      'swedbank',
      'handelsbanken',
      'nordea',
      'sbab',
      'ica-banken',
      'lansforsakringar',
      'skandia',
      'avanza',
      'sparbanken-syd',
    ],
    cards: ['swedbank', 'handelsbanken', 'nordea', 'ica-banken', 'resurs-bank'],
  },
  poland: {
    wallets: ['blik', 'global/revolut', 'global/paypal'],
    banks: [
      'mbank',
      'bank-millennium',
      'alior-bank',
      'citi-handlowy',
      'nest-bank',
      'getin-bank',
      'plus-bank',
    ],
    cards: ['mbank', 'bank-millennium', 'alior-bank', 'citi-handlowy'],
  },
  russia: {
    wallets: ['yoomoney'],
    banks: [
      'sberbank',
      'vtb',
      'alfa-bank',
      'gazprombank',
      'rosbank',
      'sovcombank',
      'otkritie',
      'mts-bank',
      'uralsib',
    ],
    cards: ['sberbank', 'alfa-bank', 'vtb', 'sovcombank', 'home-credit-bank'],
  },
  turkey: {
    wallets: ['papara', 'ininal'],
    banks: [
      'ziraat-bankas',
      'isbank',
      'garanti-bbva',
      'akbank',
      'yap-kredi',
      'vak-fbank',
      'halkbank',
      'qnb-finansbank',
      'denizbank',
      'enpara',
      'teb',
      'kuveyt-turk',
    ],
    cards: ['garanti-bbva', 'yap-kredi', 'akbank', 'isbank', 'qnb-finansbank'],
  },
  ukraine: {
    wallets: [],
    banks: [
      'privat24',
      'monobank',
      'a-bank',
      'pumb',
      'raiffeisen-bank-ukraine',
      'sense-bank',
      'ukrsibbank',
      'ukrgasbank',
      'credit-agricole-ukraine',
      'ukreximbank',
    ],
    cards: ['monobank', 'privat24', 'a-bank', 'pumb'],
  },
  global: {
    wallets: ['paypal', 'revolut', 'wise', 'payoneer', 'skrill'],
    banks: ['n26', 'revolut', 'wise'],
    cards: ['visa', 'mastercard', 'american-express'],
  },
};

/**
 * Currencies used by one country the logo set covers. The shared ones (USD,
 * EUR) say nothing about where someone banks, so they are left to the device
 * region.
 */
const CURRENCY_COUNTRY: Record<string, string> = {
  MYR: 'malaysia',
  SGD: 'singapore',
  PHP: 'philippines',
  IDR: 'indonesia',
  THB: 'thailand',
  VND: 'vietnam',
  INR: 'india',
  CNY: 'china',
  TWD: 'taiwan',
  JPY: 'japan',
  KRW: 'south-korea',
  BRL: 'brazil',
  MXN: 'mexico',
  DKK: 'denmark',
  NOK: 'norway',
  SEK: 'sweden',
  PLN: 'poland',
  RUB: 'russia',
  TRY: 'turkey',
  UAH: 'ukraine',
};

const REGION_COUNTRY: Record<string, string> = {
  US: 'united-states',
  CN: 'china',
  MY: 'malaysia',
  MX: 'mexico',
  ES: 'spain',
  BR: 'brazil',
  PT: 'portugal',
  DE: 'germany',
  FR: 'france',
  IT: 'italy',
  IN: 'india',
  ID: 'indonesia',
  JP: 'japan',
  SG: 'singapore',
  KR: 'south-korea',
  TW: 'taiwan',
  DK: 'denmark',
  NO: 'norway',
  NL: 'netherlands',
  PL: 'poland',
  RU: 'russia',
  SE: 'sweden',
  TH: 'thailand',
  TR: 'turkey',
  UA: 'ukraine',
  VN: 'vietnam',
  PH: 'philippines',
};

const SHIPPED_COUNTRIES = new Set(ACCOUNT_LOGO_COUNTRIES.map((country) => country.slug));

/**
 * The country whose accounts the step shows first: the one the user browsed
 * logos for before, else the country of a currency only one country uses,
 * else the device region, else the international brands.
 */
export function resolveStarterCountry({
  savedCountry,
  currencyCode,
  regionCode,
}: {
  savedCountry?: string | null;
  currencyCode?: string | null;
  regionCode?: string | null;
}): string {
  if (savedCountry && SHIPPED_COUNTRIES.has(savedCountry)) return savedCountry;
  const byCurrency = currencyCode ? CURRENCY_COUNTRY[currencyCode.toUpperCase()] : undefined;
  if (byCurrency && SHIPPED_COUNTRIES.has(byCurrency)) return byCurrency;
  const byRegion = regionCode ? REGION_COUNTRY[regionCode.toUpperCase()] : undefined;
  if (byRegion && SHIPPED_COUNTRIES.has(byRegion)) return byRegion;
  return GLOBAL_COUNTRY;
}

function resolveLogos(country: string, entries: readonly string[]): AccountLogoMeta[] {
  const logos: AccountLogoMeta[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = entry.includes('/') ? entry : `${country}/${entry}`;
    const meta = getAccountLogoMeta(id);
    if (!meta || seen.has(meta.id)) continue;
    seen.add(meta.id);
    logos.push(meta);
  }
  return logos;
}

export interface StarterSection {
  kind: Exclude<StarterKind, 'cash'>;
  logos: AccountLogoMeta[];
}

/**
 * The wallets, banks and cards offered for a country, in that order and most
 * popular first. A country without a list offers all its logos as banks.
 * Empty sections are left out.
 */
export function starterSectionsForCountry(country: string): StarterSection[] {
  const starters = STARTER_ACCOUNT_LISTS[country];
  const sections: StarterSection[] = starters
    ? [
        { kind: 'wallet', logos: resolveLogos(country, starters.wallets) },
        { kind: 'bank', logos: resolveLogos(country, starters.banks) },
        { kind: 'card', logos: resolveLogos(country, starters.cards) },
      ]
    : [{ kind: 'bank', logos: getLogosForCountry(country) }];
  return sections.filter((section) => section.logos.length > 0);
}

const WALLET_LOGO_IDS = new Set(
  Object.entries(STARTER_ACCOUNT_LISTS).flatMap(([country, starters]) =>
    starters.wallets.map((entry) => (entry.includes('/') ? entry : `${country}/${entry}`)),
  ),
);

/** What a logo found by search becomes: a wallet when it is one somewhere, else a bank. */
export function starterKindForLogo(logoId: string): 'wallet' | 'bank' {
  return WALLET_LOGO_IDS.has(logoId) ? 'wallet' : 'bank';
}

export interface StarterSelection {
  kind: StarterKind;
  /** Null for cash and for a bank typed by name that has no logo. */
  logoId: string | null;
  /** The brand's name, or what the user typed. */
  name: string;
}

/** One key per thing that can be picked: the same bank can be a bank and a card. */
export function starterSelectionKey(selection: Pick<StarterSelection, 'kind' | 'logoId' | 'name'>) {
  // There is one cash account, whatever language its name was given in.
  if (selection.kind === 'cash') return 'cash';
  return `${selection.kind}:${selection.logoId ?? selection.name.trim().toLowerCase()}`;
}

/** The account groups the starter accounts go in; the same ones the default set uses. */
export const STARTER_GROUP_BY_KIND: Record<StarterKind, 'Cash' | 'Bank Accounts' | 'Credit Cards'> =
  {
    cash: 'Cash',
    wallet: 'Cash',
    bank: 'Bank Accounts',
    card: 'Credit Cards',
  };

export interface StarterAccountSeed {
  name: string;
  type: Extract<AccountType, 'debit' | 'credit'>;
  accountGroup: string;
  logoId: string | null;
}

/**
 * The accounts to create for what was picked, in the order picked, at most
 * MAX_STARTER_ACCOUNTS. Cash takes `names.cash`, in the language the user
 * finished in, and a card is named "<brand> Card" through `names.card`, so a
 * bank and its card can both be picked without clashing.
 */
export function starterAccountSeeds(
  selections: readonly StarterSelection[],
  names: { cash: string; card: (brand: string) => string },
): StarterAccountSeed[] {
  const seen = new Set<string>();
  const seeds: StarterAccountSeed[] = [];
  for (const selection of selections) {
    const key = starterSelectionKey(selection);
    if (seen.has(key)) continue;
    seen.add(key);
    const brand = selection.kind === 'cash' ? names.cash.trim() : selection.name.trim();
    if (!brand) continue;
    seeds.push({
      name: selection.kind === 'card' ? names.card(brand) : brand,
      type: selection.kind === 'card' ? 'credit' : 'debit',
      accountGroup: STARTER_GROUP_BY_KIND[selection.kind],
      logoId: selection.logoId,
    });
    if (seeds.length >= MAX_STARTER_ACCOUNTS) break;
  }
  return seeds;
}
