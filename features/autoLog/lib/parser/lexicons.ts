// Word lists the payment-alert classifier matches against. These follow the
// language banks write alerts in, which is often not the app's UI language, so
// they are data rather than i18n keys. Latin-script entries match as whole
// words (case-insensitive); entries in scripts without spaces (Chinese,
// Japanese, Korean, Thai) match as substrings.
//
// Grow these from real alerts: every miss in the fixture corpus
// (__tests__/fixtures/payment-alerts) should end up as a word here or a test
// documenting why not.

export interface Lexicon {
  /** Whole-word, case-insensitive. Multi-word phrases are fine. */
  words: readonly string[];
  /** Plain substrings, for scripts that do not separate words with spaces. */
  substrings: readonly string[];
}

/** One-time codes. An alert carrying one is never a transaction. */
export const OTP: Lexicon = {
  words: [
    'otp',
    'tac',
    'one-time password',
    'one time password',
    'one-time pin',
    'one time pin',
    'one-time passcode',
    'verification code',
    'security code',
    'authentication code',
    'do not share',
    'never share',
    "don't share",
    'kod tac',
    'kod pengesahan',
    'jangan kongsi',
    'jangan berikan',
    'kode otp',
    'kode verifikasi',
    'jangan bagikan',
    'código de verificação',
    'código de verificación',
    'código de seguridad',
    'bestätigungscode',
    'code de vérification',
    'codice di verifica',
    'mã otp',
    'mã xác thực',
    'mã xác nhận',
  ],
  substrings: [
    '验证码',
    '驗證碼',
    '認証コード',
    '確認コード',
    'ワンタイムパスワード',
    '인증번호',
    'รหัส otp',
    'รหัสยืนยัน',
  ],
};

/** Payments that did not go through. */
export const DECLINED: Lexicon = {
  words: [
    'declined',
    'unsuccessful',
    'not successful',
    'failed',
    'rejected',
    'insufficient',
    'could not be processed',
    'was not approved',
    'ditolak',
    'tidak berjaya',
    'gagal',
    'tidak berhasil',
    'rechazada',
    'rechazado',
    'recusada',
    'recusado',
    'abgelehnt',
    'refusé',
    'refusée',
    'rifiutato',
    'rifiutata',
    'thất bại',
    'bị từ chối',
  ],
  substrings: ['失败', '失敗', '拒绝', '拒絶', '거절', '실패', 'ไม่สำเร็จ', 'ถูกปฏิเสธ'],
};

/**
 * Money that will move later: reminders, scheduled and future debits. They
 * name an amount and often a debit verb, but nothing has been spent yet.
 */
export const FUTURE: Lexicon = {
  words: [
    'will be debited',
    'will be charged',
    'will be deducted',
    'will be paid',
    'to be debited',
    'to be charged',
    'scheduled',
    'upcoming',
    'is due',
    'due on',
    'due date',
    'payment due',
    'minimum payment',
    'reminder',
    'akan didebitkan',
    'akan dipotong',
    'akan dibayar',
    'tarikh akhir',
    'peringatan',
    'jatuh tempo',
    'akan didebet',
    'será debitado',
    'será cobrado',
    'vencimiento',
    'vencimento',
    'wird abgebucht',
    'sera prélevé',
    'échéance',
  ],
  substrings: [
    '将扣款',
    '即将扣款',
    '还款提醒',
    '引き落とし予定',
    '납부 예정',
    '결제 예정',
    'ครบกำหนด',
  ],
};

/** Money coming back for an earlier purchase. */
export const REFUND: Lexicon = {
  words: [
    'refund',
    'refunded',
    'reversal',
    'reversed',
    'chargeback',
    'bayaran balik',
    'pemulangan',
    'pengembalian dana',
    'dikembalikan',
    'reembolso',
    'estorno',
    'rückerstattung',
    'remboursement',
    'rimborso',
    'hoàn tiền',
  ],
  substrings: ['退款', '退还', '退費', '返金', '환불', 'คืนเงิน'],
};

/** Money coming in. */
export const INCOME: Lexicon = {
  words: [
    'received',
    'credited',
    'credit of',
    'deposit',
    'deposited',
    'incoming',
    'money in',
    'you got',
    'paid you',
    'sent you',
    'diterima',
    'dikreditkan',
    'telah menerima',
    'wang masuk',
    'dana masuk',
    'menerima',
    'recibiste',
    'recebido',
    'recebeu',
    'pix recebido',
    'gutschrift',
    'zahlungseingang',
    'reçu',
    'crédité',
    'virement reçu',
    'accredito',
    'natanggap',
    'nhận được',
    'ghi có',
  ],
  substrings: [
    '收到',
    '入账',
    '到账',
    '已收款',
    '转入',
    '入金',
    '受取',
    '입금',
    '받았',
    'รับเงิน',
    'เงินเข้า',
  ],
};

/** Money moving between the user's own accounts: wallet top-ups, cash withdrawals. */
export const TRANSFER: Lexicon = {
  words: [
    'top up',
    'top-up',
    'topup',
    'topped up',
    'reload',
    'reloaded',
    'cash withdrawal',
    'atm withdrawal',
    'withdrawal at',
    'tambah nilai',
    'isi ulang',
    'isi saldo',
    'tarik tunai',
    'pengeluaran tunai',
    'recarga',
    'nạp tiền',
    'rút tiền',
  ],
  substrings: ['充值', '提现', '取款', 'チャージ', '충전', 'เติมเงิน'],
};

/**
 * Money going out, said in a way that only describes a payment that happened:
 * past tense and debit verbs. Enough on its own to call an alert a spend.
 */
export const SPEND_STRONG: Lexicon = {
  words: [
    'spent',
    'you spent',
    'paid',
    'you paid',
    'payment made',
    'purchased',
    'debited',
    'debit of',
    'charged',
    'charge of',
    'deducted',
    'transaction of',
    'transaction at',
    'transaction for',
    'txn of',
    'txn at',
    'used at',
    'used for',
    'used on',
    'was used',
    'sent',
    'transfer of',
    'transferred',
    'authorised',
    'authorized',
    'dibelanjakan',
    'dibayar',
    'dibayarkan',
    'didebitkan',
    'didebet',
    'terdebet',
    'membayar',
    'pagaste',
    'has pagado',
    'pix enviado',
    'bezahlt',
    'belastet',
    'abgebucht',
    'débité',
    'payé',
    'addebitato',
    'betaald',
    'binayaran',
    'nagbayad',
  ],
  substrings: [
    '消费',
    '已支付',
    '付款成功',
    '扣款',
    '刷卡',
    'ご利用',
    '決済',
    '결제',
    '승인',
    'ชำระ',
    'ตัดบัญชี',
  ],
};

/**
 * Payment nouns that also appear in marketing ("your next purchase"). A spend
 * only together with a completion word, or when nothing promotional is around.
 */
export const SPEND_WEAK: Lexicon = {
  words: [
    'payment of',
    'payment to',
    'payment for',
    'purchase',
    'transaksi',
    'pembayaran',
    'pembelian',
    'compra',
    'pago',
    'cargo',
    'pagamento',
    'débito',
    'zahlung',
    'kartenzahlung',
    'abbuchung',
    'paiement',
    'achat',
    'acquisto',
    'addebito',
    'betaling',
    'afschrijving',
    'thanh toán',
    'chi tiêu',
    'ghi nợ',
    'ödeme',
    'harcama',
    'płatność',
    'zakup',
  ],
  substrings: ['支付', '付款', '支出', '支払', 'จ่าย', 'ใช้จ่าย'],
};

/** Words that say a payment went through; turn a weak spend into a strong one. */
export const COMPLETION: Lexicon = {
  words: [
    'successful',
    'successfully',
    'completed',
    'approved',
    'confirmed',
    'berjaya',
    'berhasil',
    'sukses',
    'exitoso',
    'exitosa',
    'aprovada',
    'aprovado',
    'erfolgreich',
    'réussi',
    'effectué',
    'effettuato',
    'thành công',
  ],
  substrings: ['成功', '完了', '완료', 'สำเร็จ'],
};

/** Person-to-person sends: a spend, but possibly to the user's own account elsewhere. */
export const P2P: Lexicon = {
  words: ['sent', 'transfer of', 'transferred', 'duitnow', 'instapay', 'pix enviado', 'pemindahan'],
  substrings: ['转账', '轉帳', '振込', '송금', 'โอนเงิน'],
};

/** Marketing: only decides the kind when no transaction verb is present. */
export const PROMO: Lexicon = {
  words: [
    'cashback',
    'cash back',
    'promo',
    'promotion',
    'offer',
    'voucher',
    'coupon',
    'deal',
    'discount',
    'rebate',
    'win',
    'enjoy',
    'get up to',
    'up to',
    'limited time',
    'terms apply',
    't&c',
    'sign up',
    'apply now',
    'ganjaran',
    'tawaran',
    'diskaun',
    'promosi',
    'hadiah',
    'penawaran',
    'diskon',
    'oferta',
    'desconto',
    'descuento',
    'angebot',
    'rabatt',
    'offre',
    'sconto',
    'khuyến mãi',
    'ưu đãi',
  ],
  substrings: [
    '优惠',
    '折扣',
    '返现',
    'キャンペーン',
    '割引',
    '할인',
    '혜택',
    '이벤트',
    'โปรโมชั่น',
    'ส่วนลด',
  ],
};

/** Balance and statement notices: an amount, but no payment. */
export const BALANCE: Lexicon = {
  words: [
    'balance',
    'available balance',
    'avail bal',
    'outstanding',
    'statement',
    'credit limit',
    'baki',
    'penyata',
    'saldo',
    'tagihan',
    'extracto',
    'fatura',
    'kontostand',
    'solde',
    'số dư',
  ],
  substrings: ['余额', '账单', '残高', '請求', '잔액', '청구', 'ยอดคงเหลือ'],
};

/** Card authorization holds (hotels, fuel): real, but the final amount may differ. */
export const AUTH_HOLD: Lexicon = {
  words: [
    'pre-authorization',
    'pre-authorisation',
    'preauthorization',
    'authorization hold',
    'hold of',
  ],
  substrings: ['预授权', '預授權'],
};

/** Words just before an amount that make it something other than the payment. */
export const NOT_THE_PAYMENT_BEFORE: readonly string[] = [
  'balance',
  'bal',
  'avail',
  'available',
  'baki',
  'saldo',
  'limit',
  'outstanding',
  'minimum',
  'min',
  'cashback',
  'cash back',
  'reward',
  'rewards',
  'points',
  'save',
  'up to',
  'worth',
  'earn',
  'spend',
  'above',
  'over',
  'min. spend',
  'remaining',
  'baki tersedia',
];

/** Words that introduce a merchant or payee, preferred in this order. */
export const MERCHANT_LEAD_INS: readonly string[] = [
  'at',
  '@',
  'merchant',
  'di',
  'to',
  'kepada',
  'ke',
  'pada',
  'for',
];

/** Words that introduce a payer on money coming in. */
export const PAYER_LEAD_INS: readonly string[] = ['from', 'daripada', 'dari', 'de', 'von', 'da'];

/**
 * Words that end a merchant name. Matched as whole words after the name has
 * started, so a name may still contain them at its very beginning.
 */
export const COUNTERPARTY_STOP_WORDS: readonly string[] = [
  'on',
  'using',
  'with',
  'via',
  'card',
  'ending',
  'ref',
  'reference',
  'txn',
  'trx',
  'transaction',
  'from',
  'for',
  'at',
  'is',
  'was',
  'has',
  'have',
  'had',
  'of',
  'and',
  'amount',
  'amt',
  'pada',
  'dengan',
  'menggunakan',
  'guna',
  'tarikh',
  'melalui',
  'untuk',
  'telah',
  'sebanyak',
  'sejumlah',
  'berjaya',
  'berhasil',
  'successful',
  'successfully',
  'approved',
  'available',
  'balance',
  'date',
  'time',
];

/** A "name" that is really the paying account, not the merchant. */
export const FUNDING_SOURCE_PREFIXES: readonly string[] = [
  'your',
  'a/c',
  'ac',
  'acct',
  'account',
  'akaun',
  'rekening',
  'card',
  'kad',
  'kartu',
  'the account',
  'my',
];
