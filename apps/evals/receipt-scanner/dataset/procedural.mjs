// Seeded procedural cases: breadth on top of the hand-written traps in
// ./cases.mjs. Every locale profile mirrors how receipts there really look
// (currency formatting, date order, tax regime, cash rounding, payment
// methods), and the user's category list is the one a user in that locale
// would have. The seed is fixed, so the generated set is identical on every
// build; bump PROCEDURAL_VERSION to deliberately reshuffle it.

import { txnFromReceipt, detailFromReceipt } from './cases.mjs';
import { computeReceipt, formatMinor, moneyStyle } from './receipt.mjs';
import {
  CAT_DE,
  CAT_DEFAULT,
  CAT_ID,
  CAT_JA,
  CAT_MY_CUSTOM,
  CAT_NESTED,
  REFERENCE_DATE,
} from './reference.mjs';
import { rng } from './scene.mjs';

export const PROCEDURAL_VERSION = 1;

const POOLS = {
  food: [
    ['Chicken Rice', 6, 14],
    ['Fried Noodles', 7, 13],
    ['Beef Burger', 9, 18],
    ['Caesar Salad', 8, 15],
    ['Fish & Chips', 12, 22],
    ['Laksa', 8, 14],
    ['Fried Rice', 7, 12],
    ['Iced Lemon Tea', 2, 6],
    ['Soft Drink', 2, 5],
    ['Spring Rolls', 5, 9],
    ['Soup of the Day', 5, 10],
    ['Grilled Salmon', 18, 32],
  ],
  coffee: [
    ['Latte', 4, 8],
    ['Cappuccino', 4, 8],
    ['Americano', 3, 6],
    ['Mocha', 5, 9],
    ['Croissant', 3, 6],
    ['Banana Bread', 3, 6],
    ['Cheesecake', 6, 10],
    ['Iced Chocolate', 5, 9],
  ],
  groceries: [
    ['Milk 1L', 2, 5],
    ['Bread Loaf', 2, 6],
    ['Eggs 10pk', 4, 8],
    ['Rice 5kg', 15, 30],
    ['Chicken Breast', 8, 15],
    ['Apples 1kg', 4, 9],
    ['Pasta 500g', 1.5, 4],
    ['Cooking Oil', 6, 15],
    ['Yogurt', 2, 5],
    ['Coffee Powder', 8, 18],
    ['Tissue Box', 3, 7],
    ['Detergent', 10, 25],
    ['Instant Noodles', 3, 7],
    ['Orange Juice 1L', 3, 7],
  ],
  pharmacy: [
    ['Paracetamol 16s', 4, 12],
    ['Vitamin C', 15, 45],
    ['Cough Syrup', 8, 20],
    ['Hand Sanitiser', 4, 10],
    ['Face Masks 50pc', 8, 20],
    ['Plasters', 3, 8],
    ['Toothpaste', 3, 9],
    ['Sunscreen', 15, 45],
  ],
  retail: [
    ['T-Shirt', 15, 40],
    ['Phone Charger', 15, 45],
    ['Notebook', 3, 9],
    ['Water Bottle', 10, 30],
    ['Umbrella', 12, 35],
    ['Socks 3pk', 8, 18],
    ['USB Cable', 8, 20],
    ['Backpack', 40, 120],
  ],
};

const PROFILES = [
  {
    currency: 'MYR',
    categories: CAT_MY_CUSTOM,
    dateFormat: 'DD/MM/YYYY',
    rounding: true,
    factor: 1,
    merchants: {
      food: ['RESTORAN NASI KANDAR PELITA', 'OLDTOWN KOPITIAM', 'MAMAK CORNER SS15'],
      coffee: ['ZUS COFFEE', 'KOPI SATU TIGA'],
      groceries: ['AEON BIG', '99 SPEEDMART', 'JAYA GROCER'],
      pharmacy: ['GUARDIAN PHARMACY', 'BIG PHARMACY'],
      retail: ['MR DIY', 'DAISO MALAYSIA'],
    },
    cat: {
      food: ['Makan'],
      coffee: ['Coffee', 'Makan'],
      groceries: ['Groceries'],
      pharmacy: ['Clinic & Pharmacy'],
      retail: ['Shopping'],
    },
    taxFor: (type) =>
      type === 'food'
        ? {
            service: { label: 'SERVICE CHARGE 10%', rate: 0.1 },
            tax: { label: 'SST 6%', rate: 0.06 },
          }
        : {},
    payments: [
      { tendered: 'round' },
      { method: 'VISA', last4: '4242' },
      { method: 'DEBIT', last4: '8812' },
      { method: 'TNG EWALLET' },
    ],
  },
  {
    currency: 'USD',
    categories: CAT_NESTED,
    dateFormat: 'MM/DD/YYYY',
    factor: 1,
    merchants: {
      food: ["MARIO'S TRATTORIA", 'SMOKEHOUSE BBQ', 'PHO SAIGON'],
      coffee: ['DAILY GRIND COFFEE', 'BREW LAB'],
      groceries: ['VALLEY FRESH MARKET', 'PANTRY PLUS'],
      pharmacy: ['MAIN ST PHARMACY'],
      retail: ['TARGETED GOODS', 'BEST GADGETS'],
    },
    cat: {
      food: ['Dining out', 'Food'],
      coffee: ['Coffee', 'Dining out', 'Food'],
      groceries: ['Groceries'],
      pharmacy: ['Pharmacy', 'Healthcare'],
      retail: ['Shopping', 'Electronics', 'Clothing'],
    },
    taxFor: () => ({ tax: { label: 'Sales Tax 7.25%', rate: 0.0725 } }),
    payments: [
      { method: 'VISA', last4: '4242' },
      { method: 'AMEX', last4: '1009' },
      { tendered: 'round' },
    ],
  },
  {
    currency: 'SGD',
    categories: CAT_DEFAULT,
    dateFormat: 'DD/MM/YYYY',
    factor: 1,
    merchants: {
      food: ['TIAN TIAN HAWKER', 'SONG FA EATERY'],
      coffee: ['YA KUN KAYA TOAST', 'TOAST BOX'],
      groceries: ['FAIRPRICE FINEST', 'SHENG SIONG'],
      pharmacy: ['WATSONS ION'],
      retail: ['MUJI SINGAPORE'],
    },
    cat: {
      food: ['Food'],
      coffee: ['Food'],
      groceries: ['Groceries'],
      pharmacy: ['Healthcare', 'Shopping'],
      retail: ['Shopping'],
    },
    taxFor: (type) =>
      type === 'food'
        ? { service: { label: 'SVC CHG 10%', rate: 0.1 }, tax: { label: 'GST 9%', rate: 0.09 } }
        : { tax: { label: 'GST 9% incl. {tax}', rate: 0.09, inclusive: true } },
    payments: [{ method: 'NETS' }, { method: 'VISA', last4: '4242' }, { method: 'PAYNOW' }],
  },
  {
    currency: 'GBP',
    categories: CAT_NESTED,
    dateFormat: 'DD/MM/YYYY',
    factor: 1,
    merchants: {
      food: ['THE RED LION', 'DISHOOM CORNER'],
      coffee: ['PRET STYLE CAFE', 'MONMOUTH LANE'],
      groceries: ['TESCO EXPRESS', 'SAINSBURY LOCAL'],
      pharmacy: ['BOOTS PHARMACY'],
      retail: ['WHSMITH'],
    },
    cat: {
      food: ['Dining out', 'Food'],
      coffee: ['Coffee', 'Dining out', 'Food'],
      groceries: ['Groceries'],
      pharmacy: ['Pharmacy', 'Healthcare'],
      retail: ['Shopping'],
    },
    taxFor: () => ({ tax: { label: 'VAT 20% incl. {tax}', rate: 0.2, inclusive: true } }),
    payments: [{ method: 'CONTACTLESS' }, { method: 'MASTERCARD', last4: '5521' }],
  },
  {
    currency: 'JPY',
    categories: CAT_JA,
    dateFormat: 'JP',
    factor: 110,
    font: 'jp',
    labels: { total: '合計', subtotal: '小計', tendered: 'お預り', change: 'お釣り' },
    merchants: {
      food: ['定食屋 まるや', 'カレーハウス 一番'],
      coffee: ['喫茶 みどり', 'カフェ ブルー'],
      groceries: ['スーパー ライフ', 'マルエツ 中野店'],
      pharmacy: ['マツモト薬局'],
      retail: ['ダイソー 新宿店'],
    },
    cat: {
      food: ['外食', '食費'],
      coffee: ['外食', '食費'],
      groceries: ['食費'],
      pharmacy: ['医療費', '日用品'],
      retail: ['日用品', 'その他'],
    },
    taxFor: () => ({ tax: { label: '(内消費税等 ¥{tax})', rate: 0.1, inclusive: true } }),
    payments: [{ tendered: 'round' }, { method: 'クレジット' }],
  },
  {
    currency: 'IDR',
    categories: CAT_ID,
    dateFormat: 'DD/MM/YYYY',
    factor: 6500,
    merchants: {
      food: ['RM PADANG SEDERHANA', 'BAKSO PAK KUMIS'],
      coffee: ['KOPI KENANGAN', 'JANJI JIWA'],
      groceries: ['INDOMARET', 'ALFAMART'],
      pharmacy: ['APOTEK K-24'],
      retail: ['MINISO JAKARTA'],
    },
    cat: {
      food: ['Makanan'],
      coffee: ['Makanan'],
      groceries: ['Belanja Harian'],
      pharmacy: ['Kesehatan'],
      retail: ['Belanja'],
    },
    taxFor: (type) => (type === 'food' ? { tax: { label: 'PB1 10%', rate: 0.1 } } : {}),
    payments: [{ method: 'QRIS' }, { tendered: 'round' }, { method: 'DEBIT BCA' }],
  },
  {
    currency: 'EUR',
    categories: CAT_DE,
    dateFormat: 'DD.MM.YYYY',
    factor: 1,
    labels: { total: 'SUMME', subtotal: 'ZWISCHENSUMME', tendered: 'BAR', change: 'RÜCKGELD' },
    merchants: {
      food: ['GASTHAUS ZUR LINDE', 'PIZZERIA ROMA'],
      coffee: ['CAFÉ KRANZLER', 'KAFFEERÖSTEREI'],
      groceries: ['REWE CITY', 'EDEKA MARKT'],
      pharmacy: ['APOTHEKE AM PLATZ'],
      retail: ['MÜLLER DROGERIE'],
    },
    cat: {
      food: ['Restaurant'],
      coffee: ['Restaurant', 'Lebensmittel'],
      groceries: ['Lebensmittel'],
      pharmacy: ['Gesundheit'],
      retail: ['Einkaufen'],
    },
    taxFor: () => ({ tax: { label: 'inkl. MwSt {tax}', rate: 0.19, inclusive: true } }),
    payments: [{ method: 'EC-KARTE' }, { tendered: 'round' }],
  },
  {
    currency: 'PHP',
    categories: CAT_DEFAULT,
    dateFormat: 'MM/DD/YYYY',
    factor: 40,
    merchants: {
      food: ['MANG INASAL', 'KUYA J'],
      coffee: ["BO'S COFFEE"],
      groceries: ['PUREGOLD', 'SM SUPERMARKET'],
      pharmacy: ['MERCURY DRUG'],
      retail: ['NATIONAL BOOK STORE'],
    },
    cat: {
      food: ['Food'],
      coffee: ['Food'],
      groceries: ['Groceries'],
      pharmacy: ['Healthcare'],
      retail: ['Shopping'],
    },
    taxFor: () => ({ tax: { label: 'VAT 12% incl. {tax}', rate: 0.12, inclusive: true } }),
    payments: [{ tendered: 'round' }, { method: 'GCASH' }],
  },
  {
    currency: 'AUD',
    categories: CAT_NESTED,
    dateFormat: 'DD/MM/YYYY',
    factor: 1.5,
    merchants: {
      food: ['BONDI BURGER CO', 'THAI ORCHID'],
      coffee: ['SINGLE O ESPRESSO'],
      groceries: ['COLES LOCAL', 'HARRIS FARM'],
      pharmacy: ['CHEMIST DISCOUNT'],
      retail: ['KMART'],
    },
    cat: {
      food: ['Dining out', 'Food'],
      coffee: ['Coffee', 'Dining out'],
      groceries: ['Groceries'],
      pharmacy: ['Pharmacy', 'Healthcare'],
      retail: ['Shopping'],
    },
    taxFor: () => ({ tax: { label: 'GST incl. {tax}', rate: 0.1, inclusive: true } }),
    payments: [{ method: 'EFTPOS' }, { method: 'VISA', last4: '4242' }],
  },
];

const TYPES = ['food', 'coffee', 'groceries', 'pharmacy', 'retail'];
const SCENES = {
  easy: (r) => ({
    kind: r() < 0.4 ? 'scan' : 'photo',
    background: pick(r, ['white', 'marble']),
    rotate: round1((r() - 0.5) * 3),
  }),
  medium: (r) => ({
    kind: 'photo',
    background: pick(r, ['wood', 'marble', 'dark', 'fabric']),
    rotate: round1((r() - 0.5) * 8),
    light: r() < 0.4 ? 0.4 : 0,
  }),
  hard: (r) => {
    const s = {
      kind: 'photo',
      background: pick(r, ['wood', 'dark', 'fabric']),
      rotate: round1((r() - 0.5) * 12),
    };
    const which = pick(r, ['fade', 'blur', 'noise']);
    if (which === 'fade') s.fade = 0.55 + r() * 0.15;
    if (which === 'blur') s.blur = 1.1 + r() * 0.5;
    if (which === 'noise') Object.assign(s, { noise: 0.6, light: 0.8 });
    return s;
  },
};

const pick = (r, list) => list[Math.floor(r() * list.length)];
const round1 = (n) => Math.round(n * 10) / 10;

function priceIn(profile, lo, hi, r) {
  const style = moneyStyle(profile.currency);
  const raw = (lo + r() * (hi - lo)) * profile.factor;
  if (style.decimals === 0) {
    const step = profile.currency === 'IDR' ? 500 : 10;
    return Math.max(step, Math.round(raw / step) * step);
  }
  // Prices end in a 0, 5 or 9 like real menus.
  const cents = Math.round(raw * 100);
  return (Math.floor(cents / 10) * 10 + pick(r, [0, 0, 5, 9])) / 100;
}

function dateBefore(r, maxDays) {
  const d = new Date(`${REFERENCE_DATE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1 - Math.floor(r() * maxDays));
  return d.toISOString().slice(0, 10);
}

function randomReceipt(r, profile, { minItems, maxItems }) {
  const type = pick(r, TYPES);
  const pool = [...POOLS[type]];
  const count = Math.min(pool.length, minItems + Math.floor(r() * (maxItems - minItems + 1)));
  const items = [];
  for (let i = 0; i < count; i += 1) {
    const [name, lo, hi] = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const qty = r() < 0.25 ? 2 + Math.floor(r() * 2) : 1;
    items.push({ name, qty, unit: priceIn(profile, lo, hi, r) });
  }
  const spec = {
    currency: profile.currency,
    merchant: pick(r, profile.merchants[type]),
    date: dateBefore(r, 25),
    dateFormat: profile.dateFormat,
    time: `${String(8 + Math.floor(r() * 13)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}`,
    items,
    itemStyle: pick(r, ['qtyPrefix', 'qtyAt', 'qtyLine']),
    font: profile.font,
    labels: profile.labels,
    rounding: profile.rounding,
    expectCategory: profile.cat[type],
    ...profile.taxFor(type),
  };
  const payment = pick(r, profile.payments);
  if (payment.tendered === 'round') {
    // Tender the next "round" note above the total, the way people pay cash.
    const total = computeReceipt(spec).total;
    const note =
      [5, 10, 20, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 500000].find((n) => n > total) ??
      Math.ceil(total);
    spec.payment = { tendered: note };
  } else spec.payment = payment;
  return spec;
}

/** Procedural receipt cases for quick and itemized. */
function receiptCases(mode, n, seed) {
  const r = rng(`${seed}-${PROCEDURAL_VERSION}`);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const profile = PROFILES[i % PROFILES.length];
    const difficulty = pick(r, ['easy', 'medium', 'medium', 'hard']);
    const multi = mode === 'quick' && r() < 0.15;
    const receipts = [
      randomReceipt(
        r,
        profile,
        mode === 'itemized' ? { minItems: 3, maxItems: 9 } : { minItems: 1, maxItems: 6 },
      ),
    ];
    if (multi) receipts.push(randomReceipt(r, profile, { minItems: 1, maxItems: 4 }));
    const scene = SCENES[difficulty](r);
    if (multi) scene.rotate = [round1((r() - 0.5) * 8), round1((r() - 0.5) * 8)];
    const id = `${mode}-gen-${String(i + 1).padStart(2, '0')}-${profile.currency.toLowerCase()}`;
    const expect = { transactions: receipts.map((rc) => txnFromReceipt(rc)) };
    if (mode === 'itemized')
      expect.receiptDetail = detailFromReceipt(receipts[0], [profile.currency, null]);
    out.push({
      id,
      mode,
      difficulty,
      tags: ['procedural', profile.currency, ...(multi ? ['multi-receipt'] : [])],
      notes: `Procedurally generated ${profile.currency} receipt${multi ? 's (two in one photo)' : ''}. Standard rules apply: amount is the final total after tax/service/tip/rounding${mode === 'itemized' ? '; items are purchased lines only, pre-tax' : ''}. receiptDetail.currency may be ${profile.currency} or null.`,
      input: { currency: profile.currency, categories: profile.categories },
      image: { type: 'receipts', receipts, scene },
      expect,
    });
  }
  return out;
}

/** Procedural screenshot cases: random template, merchant and account situation. */
function screenshotCases(n, seed) {
  const r = rng(`${seed}-${PROCEDURAL_VERSION}`);
  const profiles = PROFILES.filter((p) =>
    ['MYR', 'USD', 'SGD', 'GBP', 'AUD', 'PHP'].includes(p.currency),
  );
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const profile = profiles[i % profiles.length];
    const style = moneyStyle(profile.currency);
    const type = pick(r, TYPES);
    const merchant = pick(r, profile.merchants[type]).replace(
      /\b([A-Z])([A-Z']+)/g,
      (_, a, b) => a + b.toLowerCase(),
    );
    const amount = priceIn(profile, 5, 80, r);
    const amountText = formatMinor(Math.round(amount * 100), style, { symbol: true });
    const date = dateBefore(r, 20);
    const last4 = String(1000 + Math.floor(r() * 9000));
    const situation = pick(r, ['match', 'match', 'match', 'none', 'ambiguous']);
    const accounts = [
      'Cash',
      `Visa ${last4}`,
      `Mastercard ${String(1000 + Math.floor(r() * 9000))}`,
      'Savings',
    ];
    if (situation === 'ambiguous') accounts.push(`Visa ${String(1000 + Math.floor(r() * 9000))}`);
    const source =
      situation === 'match' ? `Visa •••• ${last4}` : situation === 'ambiguous' ? 'Visa' : null;
    const template = pick(r, ['walletPayment', 'bankTxnDetail', 'lockScreen']);
    const [y, m, d] = date.split('-');
    const human = `${Number(d)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${y}`;
    let data;
    if (template === 'walletPayment') {
      data = {
        amountText,
        merchant,
        rows: [
          ['Date', human],
          ...(source ? [['Paid with', source]] : []),
          ['Reference No.', `TX${Math.floor(r() * 1e8)}`],
        ],
      };
    } else if (template === 'bankTxnDetail') {
      data = {
        merchant,
        amountText: `-${amountText}`,
        rows: [
          ['Transaction date', human],
          ...(source ? [['Card', source]] : []),
          ['Type', 'Card purchase'],
        ],
      };
    } else {
      const via = source ? ` with your ${source.replace('•••• ', 'card ending ')}` : '';
      data = {
        dateLine: human,
        notifications: [
          {
            app: 'LUMEN BANK',
            color: '#c8102e',
            title: 'Purchase',
            body: `You spent ${amountText} at ${merchant}${via}.`,
            time: 'now',
          },
        ],
      };
    }
    out.push({
      id: `screenshot-gen-${String(i + 1).padStart(2, '0')}-${template}`,
      mode: 'screenshot',
      difficulty: situation === 'ambiguous' ? 'hard' : 'medium',
      tags: ['procedural', profile.currency, `account:${situation}`],
      notes: `Procedurally generated ${template} screen. Account situation: ${situation === 'match' ? `the card's last four (${last4}) uniquely matches "Visa ${last4}"` : situation === 'none' ? 'no payment source shown, so account must be ""' : 'only "Visa" is shown and the user has two Visa accounts, so account must be ""'}.`,
      input: { currency: profile.currency, categories: profile.categories, accounts },
      image: { type: 'screen', template, data },
      expect: {
        transactions: [
          {
            amount,
            date,
            category: profile.cat[type],
            note: [merchant],
            account: situation === 'match' ? `Visa ${last4}` : '',
          },
        ],
      },
    });
  }
  return out;
}

export function proceduralCases() {
  return [
    ...receiptCases('quick', 26, 'quick'),
    ...receiptCases('itemized', 22, 'itemized'),
    ...screenshotCases(24, 'screenshot'),
  ];
}
