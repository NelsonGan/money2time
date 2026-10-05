// Known banking, wallet and messaging apps whose notifications carry payments.
// Used to suggest apps in Android setup (only the installed ones appear: the
// config plugin declares these packages in a <queries> block) and to suggest
// the paying account from its bank logo (binding.ts, rule 6).
//
// Package ids were collected for this list and should be re-checked against
// the Play Store when adding entries; a wrong id only means the app is never
// suggested, it can still be picked from "Recently active". Logo ids must exist
// in constants/accountLogos.generated.ts (a test checks this).

export type PaymentAppKind = 'bank' | 'wallet' | 'card' | 'messages' | 'super_app';

export interface PaymentApp {
  package: string;
  name: string;
  /** Account-logo country folder, or 'global'. */
  country: string;
  kind: PaymentAppKind;
  /** Words that name the brand in account names ("maybank"). */
  brands: readonly string[];
  /** Account logo ids that belong to this app's institution. */
  logoIds: readonly string[];
}

export const PAYMENT_APPS: readonly PaymentApp[] = [
  // Malaysia
  {
    package: 'com.maybank2u.life',
    name: 'MAE by Maybank2u',
    country: 'malaysia',
    kind: 'bank',
    brands: ['maybank', 'mae'],
    logoIds: ['malaysia/maybank'],
  },
  {
    package: 'my.com.tngdigital.ewallet',
    name: "Touch 'n Go eWallet",
    country: 'malaysia',
    kind: 'wallet',
    brands: ['touch n go', "touch 'n go", 'tng', 'tng ewallet'],
    logoIds: ['malaysia/touch-n-go-ewallet'],
  },
  {
    package: 'com.grabtaxi.passenger',
    name: 'Grab',
    country: 'global',
    kind: 'super_app',
    brands: ['grabpay', 'grab'],
    logoIds: ['malaysia/grabpay', 'singapore/grabpay', 'philippines/grabpay-ph'],
  },
  {
    package: 'com.shopee.my',
    name: 'Shopee',
    country: 'malaysia',
    kind: 'super_app',
    brands: ['shopeepay', 'shopee'],
    logoIds: ['malaysia/shopeepay'],
  },
  {
    package: 'my.com.myboost',
    name: 'Boost',
    country: 'malaysia',
    kind: 'wallet',
    brands: ['boost'],
    logoIds: ['malaysia/boost-bank'],
  },
  {
    package: 'com.tpaay.bigpay',
    name: 'BigPay',
    country: 'malaysia',
    kind: 'wallet',
    brands: ['bigpay'],
    logoIds: ['malaysia/bigpay'],
  },
  // Singapore
  {
    package: 'com.dbs.dbspaylah',
    name: 'DBS PayLah!',
    country: 'singapore',
    kind: 'wallet',
    brands: ['paylah', 'dbs'],
    logoIds: ['singapore/dbs-bank'],
  },
  {
    package: 'com.dbs.sg.digibankmobile',
    name: 'DBS digibank',
    country: 'singapore',
    kind: 'bank',
    brands: ['dbs', 'posb'],
    logoIds: ['singapore/dbs-bank'],
  },
  {
    package: 'com.ocbc.mobile',
    name: 'OCBC',
    country: 'singapore',
    kind: 'bank',
    brands: ['ocbc'],
    logoIds: ['singapore/ocbc', 'malaysia/ocbc-malaysia'],
  },
  // Philippines
  {
    package: 'com.globe.gcash.android',
    name: 'GCash',
    country: 'philippines',
    kind: 'wallet',
    brands: ['gcash'],
    logoIds: ['philippines/gcash'],
  },
  {
    package: 'com.paymaya',
    name: 'Maya',
    country: 'philippines',
    kind: 'wallet',
    brands: ['maya', 'paymaya'],
    logoIds: ['philippines/maya'],
  },
  // Indonesia
  {
    package: 'com.bca',
    name: 'BCA mobile',
    country: 'indonesia',
    kind: 'bank',
    brands: ['bca'],
    logoIds: ['indonesia/bank-central-asia'],
  },
  {
    package: 'ovo.id',
    name: 'OVO',
    country: 'indonesia',
    kind: 'wallet',
    brands: ['ovo'],
    logoIds: [],
  },
  {
    package: 'id.dana',
    name: 'DANA',
    country: 'indonesia',
    kind: 'wallet',
    brands: ['dana'],
    logoIds: [],
  },
  {
    package: 'com.gojek.app',
    name: 'Gojek',
    country: 'indonesia',
    kind: 'super_app',
    brands: ['gopay', 'gojek'],
    logoIds: [],
  },
  // India
  {
    package: 'com.phonepe.app',
    name: 'PhonePe',
    country: 'india',
    kind: 'wallet',
    brands: ['phonepe'],
    logoIds: ['india/phonepe'],
  },
  {
    package: 'net.one97.paytm',
    name: 'Paytm',
    country: 'india',
    kind: 'wallet',
    brands: ['paytm'],
    logoIds: ['india/paytm'],
  },
  {
    package: 'com.google.android.apps.nbu.paisa.user',
    name: 'Google Pay',
    country: 'india',
    kind: 'wallet',
    brands: ['google pay', 'gpay'],
    logoIds: [],
  },
  // Thailand, Vietnam, Japan, Korea, China
  {
    package: 'th.co.truemoney.wallet',
    name: 'TrueMoney',
    country: 'thailand',
    kind: 'wallet',
    brands: ['truemoney'],
    logoIds: ['thailand/truemoney'],
  },
  {
    package: 'com.kasikorn.retail.mbanking.wap',
    name: 'K PLUS',
    country: 'thailand',
    kind: 'bank',
    brands: ['kasikorn', 'kbank', 'k plus'],
    logoIds: ['thailand/kasikornbank'],
  },
  {
    package: 'com.mservice.momotransfer',
    name: 'MoMo',
    country: 'vietnam',
    kind: 'wallet',
    brands: ['momo'],
    logoIds: ['vietnam/momo'],
  },
  {
    package: 'jp.ne.paypay.android.app',
    name: 'PayPay',
    country: 'japan',
    kind: 'wallet',
    brands: ['paypay'],
    logoIds: ['japan/paypay', 'japan/paypay-bank'],
  },
  {
    package: 'viva.republica.toss',
    name: 'Toss',
    country: 'south-korea',
    kind: 'bank',
    brands: ['toss'],
    logoIds: ['south-korea/toss', 'south-korea/toss-bank'],
  },
  {
    package: 'com.eg.android.AlipayGphone',
    name: 'Alipay',
    country: 'china',
    kind: 'wallet',
    brands: ['alipay', '支付宝'],
    logoIds: ['china/alipay'],
  },
  {
    package: 'com.tencent.mm',
    name: 'WeChat',
    country: 'china',
    kind: 'super_app',
    brands: ['wechat pay', '微信支付'],
    logoIds: ['china/wechat-pay'],
  },
  // Americas and Europe
  {
    package: 'com.nu.production',
    name: 'Nubank',
    country: 'brazil',
    kind: 'bank',
    brands: ['nubank', 'nu'],
    logoIds: ['brazil/nubank'],
  },
  {
    package: 'com.picpay',
    name: 'PicPay',
    country: 'brazil',
    kind: 'wallet',
    brands: ['picpay'],
    logoIds: ['brazil/picpay'],
  },
  {
    package: 'com.chase.sig.android',
    name: 'Chase',
    country: 'united-states',
    kind: 'bank',
    brands: ['chase'],
    logoIds: ['united-states/chase'],
  },
  {
    package: 'com.venmo',
    name: 'Venmo',
    country: 'united-states',
    kind: 'wallet',
    brands: ['venmo'],
    logoIds: ['united-states/venmo'],
  },
  {
    package: 'com.squareup.cash',
    name: 'Cash App',
    country: 'united-states',
    kind: 'wallet',
    brands: ['cash app'],
    logoIds: ['united-states/cash-app'],
  },
  {
    package: 'com.americanexpress.android.acctsvcs.us',
    name: 'American Express',
    country: 'global',
    kind: 'card',
    brands: ['amex', 'american express'],
    logoIds: ['global/american-express'],
  },
  {
    package: 'com.paypal.android.p2pmobile',
    name: 'PayPal',
    country: 'global',
    kind: 'wallet',
    brands: ['paypal'],
    logoIds: ['global/paypal'],
  },
  {
    package: 'com.revolut.revolut',
    name: 'Revolut',
    country: 'global',
    kind: 'bank',
    brands: ['revolut'],
    logoIds: ['global/revolut'],
  },
  {
    package: 'com.transferwise.android',
    name: 'Wise',
    country: 'global',
    kind: 'bank',
    brands: ['wise'],
    logoIds: ['global/wise'],
  },
  {
    package: 'de.number26.android',
    name: 'N26',
    country: 'global',
    kind: 'bank',
    brands: ['n26'],
    logoIds: ['global/n26'],
  },
  {
    package: 'co.uk.getmondo',
    name: 'Monzo',
    country: 'united-kingdom',
    kind: 'bank',
    brands: ['monzo'],
    logoIds: [],
  },
  // Phone wallets and messaging (bank SMS arrive through these)
  {
    package: 'com.google.android.apps.walletnfcrel',
    name: 'Google Wallet',
    country: 'global',
    kind: 'card',
    brands: [],
    logoIds: [],
  },
  {
    package: 'com.samsung.android.spay',
    name: 'Samsung Wallet',
    country: 'global',
    kind: 'card',
    brands: [],
    logoIds: [],
  },
  {
    package: 'com.google.android.apps.messaging',
    name: 'Messages',
    country: 'global',
    kind: 'messages',
    brands: [],
    logoIds: [],
  },
  {
    package: 'com.samsung.android.messaging',
    name: 'Samsung Messages',
    country: 'global',
    kind: 'messages',
    brands: [],
    logoIds: [],
  },
];

const BY_PACKAGE = new Map(PAYMENT_APPS.map((app) => [app.package, app]));

export function findPaymentApp(packageName: string | null | undefined): PaymentApp | null {
  if (!packageName) return null;
  return BY_PACKAGE.get(packageName) ?? null;
}

/**
 * Apps whose alerts cover many banks or many cards (SMS apps, phone wallets):
 * binding there goes through card digits rather than one fixed account. Bank
 * apps depend on how many accounts the user keeps there, so setup decides.
 */
export function prefersByCardBinding(app: PaymentApp | null): boolean {
  return app?.kind === 'messages' || app?.kind === 'card';
}
