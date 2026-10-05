// Known banking and wallet apps whose notifications carry payments.
// Used to suggest apps in Android setup (only the installed ones appear: the
// config plugin declares these packages in a <queries> block).
//
// Package ids were collected for this list and should be re-checked against
// the Play Store when adding entries; a wrong id only means the app is never
// suggested, it can still be picked from "Recently active".

export interface PaymentApp {
  package: string;
  name: string;
}

export const PAYMENT_APPS: readonly PaymentApp[] = [
  // Malaysia
  {
    package: 'com.maybank2u.life',
    name: 'MAE by Maybank2u',
  },
  {
    package: 'my.com.tngdigital.ewallet',
    name: "Touch 'n Go eWallet",
  },
  {
    package: 'com.grabtaxi.passenger',
    name: 'Grab',
  },
  {
    package: 'com.shopee.my',
    name: 'Shopee',
  },
  {
    package: 'my.com.myboost',
    name: 'Boost',
  },
  {
    package: 'com.tpaay.bigpay',
    name: 'BigPay',
  },
  // Singapore
  {
    package: 'com.dbs.dbspaylah',
    name: 'DBS PayLah!',
  },
  {
    package: 'com.dbs.sg.digibankmobile',
    name: 'DBS digibank',
  },
  {
    package: 'com.ocbc.mobile',
    name: 'OCBC',
  },
  // Philippines
  {
    package: 'com.globe.gcash.android',
    name: 'GCash',
  },
  {
    package: 'com.paymaya',
    name: 'Maya',
  },
  // Indonesia
  {
    package: 'com.bca',
    name: 'BCA mobile',
  },
  {
    package: 'ovo.id',
    name: 'OVO',
  },
  {
    package: 'id.dana',
    name: 'DANA',
  },
  {
    package: 'com.gojek.app',
    name: 'Gojek',
  },
  // India
  {
    package: 'com.phonepe.app',
    name: 'PhonePe',
  },
  {
    package: 'net.one97.paytm',
    name: 'Paytm',
  },
  {
    package: 'com.google.android.apps.nbu.paisa.user',
    name: 'Google Pay',
  },
  // Thailand, Vietnam, Japan, Korea, China
  {
    package: 'th.co.truemoney.wallet',
    name: 'TrueMoney',
  },
  {
    package: 'com.kasikorn.retail.mbanking.wap',
    name: 'K PLUS',
  },
  {
    package: 'com.mservice.momotransfer',
    name: 'MoMo',
  },
  {
    package: 'jp.ne.paypay.android.app',
    name: 'PayPay',
  },
  {
    package: 'viva.republica.toss',
    name: 'Toss',
  },
  {
    package: 'com.eg.android.AlipayGphone',
    name: 'Alipay',
  },
  {
    package: 'com.tencent.mm',
    name: 'WeChat',
  },
  // Americas and Europe
  {
    package: 'com.nu.production',
    name: 'Nubank',
  },
  {
    package: 'com.picpay',
    name: 'PicPay',
  },
  {
    package: 'com.chase.sig.android',
    name: 'Chase',
  },
  {
    package: 'com.venmo',
    name: 'Venmo',
  },
  {
    package: 'com.squareup.cash',
    name: 'Cash App',
  },
  {
    package: 'com.americanexpress.android.acctsvcs.us',
    name: 'American Express',
  },
  {
    package: 'com.paypal.android.p2pmobile',
    name: 'PayPal',
  },
  {
    package: 'com.revolut.revolut',
    name: 'Revolut',
  },
  {
    package: 'com.transferwise.android',
    name: 'Wise',
  },
  {
    package: 'de.number26.android',
    name: 'N26',
  },
  {
    package: 'co.uk.getmondo',
    name: 'Monzo',
  },
  // Phone wallets
  {
    package: 'com.google.android.apps.walletnfcrel',
    name: 'Google Wallet',
  },
  {
    package: 'com.samsung.android.spay',
    name: 'Samsung Wallet',
  },
];
