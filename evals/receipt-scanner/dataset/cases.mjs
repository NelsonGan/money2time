// Hand-written cases: each targets one way receipt reading goes wrong in the
// real app (the trap is named in `notes`, which the judge reads). Procedural
// variety on top of these lives in ./procedural.mjs.
//
// A case:
//   { id, mode, difficulty, tags, notes,
//     input:  { currency, categories, accounts? }        what the app sends
//     image:  { type: 'receipts', receipts: [spec], scene }
//           | { type: 'screen', template, data }
//           | { type: 'paper', svg, scene }              non-receipt paper
//     expect: { transactions: [...], receiptDetail? } }  the answer key
//
// Expected transaction: { amount, date (as printed, ISO, or null), category:
// [acceptable, best first], note: [acceptable merchant/payee spellings],
// account (screenshot mode), monthDayOnly }. Amounts on receipt cases are
// computed from the spec, never typed by hand.

import { computeReceipt, escapeXml, fromMinor } from './receipt.mjs';
import {
  CAT_DE,
  CAT_DEFAULT,
  CAT_ID,
  CAT_JA,
  CAT_MY_CUSTOM,
  CAT_NESTED,
  CAT_NO_OTHER,
  CAT_ZH_HANT,
} from './reference.mjs';

// --- builders -----------------------------------------------------------------

/** The expected transaction for one receipt spec. */
export function txnFromReceipt(spec, extra = {}) {
  const fig = computeReceipt(spec);
  return {
    amount: fig.total,
    date: spec.dateFormat ? spec.date : null,
    monthDayOnly: spec.dateFormat === 'DD MMM',
    category: spec.expectCategory,
    note: spec.expectNote ?? [spec.merchant],
    ...extra,
  };
}

/** The expected receiptDetail for a single-receipt itemized case. */
export function detailFromReceipt(spec, currencies) {
  const fig = computeReceipt(spec);
  return {
    merchant: spec.expectNote ?? [spec.merchant],
    date: spec.dateFormat ? spec.date : null,
    currency: currencies,
    itemsSubtotal: fromMinor(fig.itemsMinor, fig.style),
    items: fig.lines.map((l) => ({
      name: l.name,
      aliases: l.aliases ?? [],
      quantity: l.qty,
      lineTotal: fromMinor(l.lineMinor, fig.style),
    })),
  };
}

function receiptCase({
  id,
  mode,
  receipts,
  scene,
  input,
  difficulty = 'medium',
  tags = [],
  notes,
  detailCurrencies,
  extra,
}) {
  const transactions = receipts.map((r) => txnFromReceipt(r, extra));
  const expect = { transactions };
  if (mode === 'itemized')
    expect.receiptDetail =
      receipts.length === 1 ? detailFromReceipt(receipts[0], detailCurrencies) : null;
  return {
    id,
    mode,
    difficulty,
    tags,
    notes,
    input,
    image: { type: 'receipts', receipts, scene },
    expect,
  };
}

// --- shared receipt bodies --------------------------------------------------------

const kopitiam = {
  currency: 'MYR',
  merchant: 'RESTORAN AH SENG',
  header: ['No 12, Jalan SS2/24', '47300 Petaling Jaya'],
  date: '2026-09-27',
  dateFormat: 'DD/MM/YYYY',
  time: '08:42',
  items: [
    { name: 'Kopi O Ais', qty: 2, unit: 2.8 },
    { name: 'Roti Bakar Kaya', unit: 4.5 },
    { name: 'Half Boiled Eggs', unit: 3.6 },
  ],
  expectCategory: ['Food'],
};

const myRestaurant = {
  currency: 'MYR',
  merchant: 'DRAGON PALACE RESTAURANT',
  header: ['Lot G-12, Sunway Pyramid', 'SST ID: W10-1808-32000123', 'TAX INVOICE'],
  date: '2026-09-20',
  dateFormat: 'DD/MM/YYYY',
  time: '20:15',
  meta: ['TABLE 14   PAX 4', 'CASHIER: MEI LING'],
  items: [
    { name: 'Salted Egg Prawns (M)', unit: 48.0 },
    { name: 'Sweet & Sour Fish', unit: 42.0 },
    { name: 'Kailan Garlic', unit: 18.0 },
    { name: 'Yong Chow Fried Rice', unit: 24.0 },
    { name: 'Chinese Tea', qty: 4, unit: 2.5 },
    { name: 'Wet Towel', qty: 4, unit: 0.5 },
  ],
  service: { label: 'SERVICE CHARGE 10%', rate: 0.1 },
  tax: { label: 'SST 6%', rate: 0.06 },
  rounding: true,
  payment: { method: 'MASTERCARD', last4: '5521', approval: '039281' },
  expectCategory: ['Food'],
};

// --- quick --------------------------------------------------------------------------

const quick = [
  receiptCase({
    id: 'quick-kopitiam-clean',
    mode: 'quick',
    difficulty: 'easy',
    tags: ['baseline', 'MYR'],
    notes:
      'Clean flat scan of a simple kopitiam receipt. Baseline: anything less than perfect here is a serious problem.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [kopitiam],
    scene: { kind: 'scan' },
  }),
  receiptCase({
    id: 'quick-cash-tendered-trap',
    mode: 'quick',
    tags: ['trap:tendered', 'MYR'],
    notes:
      'Paid in cash: CASH 100.00 and CHANGE are printed below the total and CASH is the largest number on the slip. The amount must be the TOTAL, not the tendered cash or the change.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'MYDIN MART',
        header: ['Subang Jaya', 'Tel: 03-5631 2200'],
        date: '2026-09-25',
        dateFormat: 'DD-MM-YY',
        time: '18:03',
        items: [
          { name: 'GARDENIA BREAD', unit: 4.3 },
          { name: 'DUTCH LADY MILK 1L', qty: 2, unit: 7.49 },
          { name: 'EGGS GRADE A 10S', unit: 6.2 },
          { name: 'MAGGI KARI 5S', unit: 6.95 },
          { name: 'BANANA BERANGAN', unit: 5.8 },
          { name: 'MILO 1KG', unit: 26.9 },
        ],
        rounding: true,
        payment: { tendered: 100 },
        expectCategory: ['Groceries'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: -3 },
  }),
  receiptCase({
    id: 'quick-us-sales-tax',
    mode: 'quick',
    difficulty: 'easy',
    tags: ['trap:subtotal', 'USD'],
    notes: 'SUBTOTAL then sales tax then TOTAL. The amount is the TOTAL after tax.',
    input: { currency: 'USD', categories: CAT_NESTED },
    receipts: [
      {
        currency: 'USD',
        merchant: "Joe's Corner Deli",
        header: ['214 W 29th St, New York, NY'],
        date: '2026-09-22',
        dateFormat: 'MM/DD/YYYY',
        time: '12:31 PM',
        items: [
          { name: 'Turkey Club', unit: 13.95 },
          { name: 'Caesar Salad', unit: 9.5 },
          { name: 'Iced Tea', qty: 2, unit: 3.25 },
        ],
        tax: { label: 'Sales Tax 8.875%', rate: 0.08875 },
        payment: { method: 'VISA', last4: '4242', approval: '88213A' },
        expectCategory: ['Dining out', 'Food'],
      },
    ],
    scene: { kind: 'photo', background: 'dark', rotate: 2 },
  }),
  receiptCase({
    id: 'quick-handwritten-tip',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['trap:tip', 'USD', 'handwriting'],
    notes:
      'US restaurant slip: the printed TOTAL is before tip; the customer wrote a TIP and a new TOTAL by hand. The amount actually paid is the handwritten total.',
    input: { currency: 'USD', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'USD',
        merchant: 'THE LITTLE OWL BISTRO',
        header: ['90 Bedford St', 'New York, NY 10014', 'Server: Dana  Table 7'],
        date: '2026-09-19',
        dateFormat: 'MM/DD/YYYY',
        time: '8:47 PM',
        items: [
          { name: 'Burrata', unit: 17.0 },
          { name: 'Pork Chop', unit: 34.0 },
          { name: 'Glass Pinot Noir', qty: 2, unit: 16.0 },
        ],
        tax: { label: 'Tax', rate: 0.08875 },
        tip: { amount: 17.5, handwritten: true },
        expectCategory: ['Food'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: 4, light: 0.4 },
  }),
  receiptCase({
    id: 'quick-service-sst-rounding',
    mode: 'quick',
    tags: ['trap:service', 'MYR', 'rounding'],
    notes:
      'Malaysian restaurant: service charge 10% + SST 6% + a rounding adjustment, paid by card. The amount is the final TOTAL after all three.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: [{ ...myRestaurant, expectCategory: ['Makan'] }],
    scene: { kind: 'photo', background: 'marble', rotate: -2 },
  }),
  receiptCase({
    id: 'quick-member-discount-gst',
    mode: 'quick',
    tags: ['trap:discount', 'SGD'],
    notes:
      'Singapore retailer: member discount on the subtotal, then GST 9%. The amount is the final TOTAL.',
    input: { currency: 'SGD', categories: CAT_NESTED },
    receipts: [
      {
        currency: 'SGD',
        merchant: 'URBAN THREADS',
        header: ['#02-31 Plaza Singapura', 'GST Reg No: 201912345K'],
        date: '2026-09-14',
        dateFormat: 'DD/MM/YYYY',
        time: '15:20',
        items: [
          { name: 'Linen Shirt', unit: 59.9 },
          { name: 'Chino Shorts', unit: 45.9 },
          { name: 'Socks 3pk', unit: 12.9 },
        ],
        receiptDiscount: { label: 'MEMBER 10% OFF', rate: 0.1 },
        tax: { label: 'GST 9%', rate: 0.09 },
        payment: { method: 'NETS' },
        expectCategory: ['Clothing', 'Shopping'],
      },
    ],
    scene: { kind: 'photo', background: 'fabric', rotate: 1 },
  }),
  receiptCase({
    id: 'quick-pharmacy-rounding',
    mode: 'quick',
    difficulty: 'easy',
    tags: ['MYR', 'rounding', 'category'],
    notes: 'Pharmacy with a rounding line. Category should land on health.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'CARING PHARMACY',
        header: ['Damansara Uptown'],
        date: '2026-09-29',
        dateFormat: 'DD/MM/YYYY',
        time: '10:12',
        items: [
          { name: 'PANADOL ACTIFAST 20S', unit: 12.83 },
          { name: 'VITAMIN C 1000MG', unit: 39.9 },
          { name: 'PLASTER STRIPS', unit: 5.46 },
        ],
        rounding: true,
        payment: { method: 'VISA', last4: '4242' },
        expectCategory: ['Clinic & Pharmacy'],
      },
    ],
    scene: { kind: 'photo', background: 'white', rotate: -1 },
  }),
  receiptCase({
    id: 'quick-jp-konbini-inclusive',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['JPY', 'trap:tendered', 'locale', 'tax-inclusive'],
    notes:
      'Japanese convenience store, all labels in Japanese: 合計 is the total, お預り is cash tendered (larger), お釣り is change. Tax is already included (内消費税). Yen has no decimals. Category must be one of the Japanese names exactly.',
    input: { currency: 'JPY', categories: CAT_JA },
    receipts: [
      {
        currency: 'JPY',
        merchant: 'ファミリーストア 渋谷店',
        header: ['東京都渋谷区道玄坂1-2-3', 'TEL 03-1234-5678'],
        date: '2026-09-28',
        dateFormat: 'JP',
        time: '07:58',
        font: 'jp',
        items: [
          { name: 'おにぎり 鮭', unit: 168, aliases: ['Onigiri salmon'] },
          { name: 'からあげ弁当', unit: 498 },
          { name: '緑茶 500ml', unit: 140 },
          { name: 'ボールペン', unit: 220 },
        ],
        tax: { label: '(内消費税等 ¥{tax})', rate: 0.1, inclusive: true },
        labels: { total: '合計', tendered: 'お預り', change: 'お釣り', subtotal: '小計' },
        showSubtotal: true,
        payment: { tendered: 2000 },
        footer: ['ありがとうございました'],
        expectCategory: ['食費', '日用品'],
      },
    ],
    scene: { kind: 'photo', background: 'dark', rotate: -4 },
  }),
  receiptCase({
    id: 'quick-de-comma-decimal',
    mode: 'quick',
    tags: ['EUR', 'locale', 'number-format', 'tax-inclusive'],
    notes:
      'German electronics receipt: "." is the thousands separator and "," the decimal mark, so 1.249,90 means 1249.90. MwSt is included in the prices, not added. SUMME is the total.',
    input: { currency: 'EUR', categories: CAT_DE },
    receipts: [
      {
        currency: 'EUR',
        merchant: 'ELEKTRO KÖNIG GmbH',
        header: ['Königsallee 22, 40212 Düsseldorf', 'USt-IdNr. DE123456789'],
        date: '2026-09-18',
        dateFormat: 'DD.MM.YYYY',
        time: '16:44',
        items: [
          { name: 'Notebook 14" Pro', unit: 1149.0 },
          { name: 'USB-C Dock', unit: 89.9 },
          { name: 'Garantie +2J', unit: 11.0 },
        ],
        tax: { label: 'inkl. 19% MwSt {tax}', rate: 0.19, inclusive: true },
        labels: { total: 'SUMME', subtotal: 'ZWISCHENSUMME' },
        payment: { method: 'GIROCARD' },
        footer: ['Vielen Dank für Ihren Einkauf'],
        expectCategory: ['Einkaufen'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: 3 },
  }),
  receiptCase({
    id: 'quick-idr-thousands',
    mode: 'quick',
    tags: ['IDR', 'locale', 'number-format', 'trap:service'],
    notes:
      'Indonesian restaurant: Rupiah has no decimals and uses "." for thousands, so Rp 125.000 is 125000 (not 125.0). Service and PB1 tax are added before the TOTAL.',
    input: { currency: 'IDR', categories: CAT_ID },
    receipts: [
      {
        currency: 'IDR',
        merchant: 'WARUNG BU SRI',
        header: ['Jl. Kemang Raya No. 8', 'Jakarta Selatan'],
        date: '2026-09-26',
        dateFormat: 'DD/MM/YYYY',
        time: '13:05',
        items: [
          { name: 'Nasi Goreng Spesial', qty: 2, unit: 38000 },
          { name: 'Sate Ayam 10tsk', unit: 45000 },
          { name: 'Es Teh Manis', qty: 3, unit: 8000 },
        ],
        service: { label: 'Service 5%', rate: 0.05 },
        tax: { label: 'PB1 10%', rate: 0.1 },
        payment: { method: 'QRIS' },
        expectCategory: ['Makanan'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: -2 },
  }),
  receiptCase({
    id: 'quick-currency-pinned',
    mode: 'quick',
    tags: ['THB', 'currency-pin'],
    notes:
      "A Thai baht receipt scanned by a user whose currency is MYR. The prompt says currency is ALWAYS the user's code and never convert: amount stays 450.00 (the printed number) and currency is MYR.",
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'THB',
        merchant: 'BAAN SUAN THAI KITCHEN',
        header: ['Sukhumvit Soi 11, Bangkok'],
        date: '2026-09-23',
        dateFormat: 'DD/MM/YYYY',
        time: '19:40',
        items: [
          { name: 'Tom Yum Goong', unit: 180 },
          { name: 'Pad Thai', unit: 120 },
          { name: 'Mango Sticky Rice', unit: 90 },
          { name: 'Singha', unit: 60 },
        ],
        expectCategory: ['Food'],
      },
    ],
    scene: { kind: 'photo', background: 'dark', rotate: 2 },
  }),
  receiptCase({
    id: 'quick-two-receipts',
    mode: 'quick',
    tags: ['multi-receipt', 'MYR'],
    notes:
      'Two separate receipts in one photo: emit exactly two transactions, one per receipt, each with its own total, date and category. Order does not matter.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: [
      { ...kopitiam, expectCategory: ['Makan', 'Coffee'] },
      {
        currency: 'MYR',
        merchant: 'SUNWAY PARKING',
        header: ['Sunway Pyramid P3'],
        date: '2026-09-27',
        dateFormat: 'DD/MM/YYYY',
        time: '11:02',
        meta: ['ENTRY 08:31  EXIT 11:02', 'DURATION 2H 31M'],
        items: [{ name: 'PARKING FEE', unit: 6.0 }],
        payment: { method: 'TNG EWALLET' },
        expectCategory: ['Parking & Toll'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: [-5, 4] },
  }),
  receiptCase({
    id: 'quick-three-receipts',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['multi-receipt', 'USD'],
    notes:
      'Three receipts side by side: grocery, pharmacy and gas. Exactly three transactions with the right total on each.',
    input: { currency: 'USD', categories: CAT_NESTED },
    receipts: [
      {
        currency: 'USD',
        merchant: 'GREENLEAF MARKET',
        date: '2026-09-21',
        dateFormat: 'MM/DD/YYYY',
        items: [
          { name: 'Organic Spinach', unit: 3.99 },
          { name: 'Chicken Thighs', unit: 9.47 },
          { name: 'Greek Yogurt', qty: 2, unit: 1.89 },
        ],
        paperWidth: 380,
        fontSize: 17,
        expectCategory: ['Groceries'],
      },
      {
        currency: 'USD',
        merchant: 'CORNER DRUG',
        date: '2026-09-21',
        dateFormat: 'MM/DD/YYYY',
        items: [
          { name: 'Ibuprofen 200mg', unit: 8.99 },
          { name: 'Toothpaste', unit: 4.49 },
        ],
        tax: { label: 'Tax 6%', rate: 0.06 },
        paperWidth: 380,
        fontSize: 17,
        expectCategory: ['Pharmacy', 'Healthcare'],
      },
      {
        currency: 'USD',
        merchant: 'SUNRISE FUEL #118',
        date: '2026-09-21',
        dateFormat: 'MM/DD/YYYY',
        meta: ['PUMP 04  REGULAR'],
        items: [{ name: 'UNLEADED 11.204 GAL', unit: 41.33 }],
        paperWidth: 380,
        fontSize: 17,
        expectCategory: ['Fuel', 'Transport'],
      },
    ],
    scene: { kind: 'photo', background: 'dark', rotate: [-3, 2, -1] },
  }),
  receiptCase({
    id: 'quick-long-grocery',
    mode: 'quick',
    tags: ['long', 'AUD'],
    notes:
      'A long supermarket receipt (24 lines). The total is at the very bottom; per-item prices must not be confused with it.',
    input: { currency: 'AUD', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'AUD',
        merchant: 'FRESHWAY SUPERMARKETS',
        header: ['Bondi Junction NSW 2022', 'ABN 88 000 014 675'],
        date: '2026-09-24',
        dateFormat: 'DD/MM/YYYY',
        time: '17:26',
        fontSize: 17,
        items: [
          ['Bananas Cavendish', 3.12],
          ['Full Cream Milk 2L', 3.4],
          ['Sourdough Loaf', 5.5],
          ['Free Range Eggs 12pk', 7.2],
          ['Tasty Cheese 500g', 8.0],
          ['Chicken Breast 1kg', 13.0],
          ['Beef Mince 500g', 7.5],
          ['Broccoli', 2.4],
          ['Carrots 1kg', 2.2],
          ['Pasta Penne 500g', 1.8],
          ['Pasta Sauce', 3.5],
          ['Olive Oil 750ml', 11.0],
          ['Rolled Oats 1kg', 3.2],
          ['Greek Yoghurt 1kg', 6.5],
          ['Apples Pink Lady', 4.85],
          ['Tomatoes', 3.96],
          ['Coffee Beans 1kg', 22.0],
          ['Dishwashing Liquid', 4.0],
          ['Paper Towel 4pk', 6.5],
          ['Toilet Paper 12pk', 9.0],
          ['Laundry Liquid 2L', 12.0],
          ['Frozen Peas 1kg', 3.3],
          ['Ice Cream 2L', 7.0],
          ['Sparkling Water 10pk', 6.0],
        ].map(([name, unit]) => ({ name, unit })),
        payment: { method: 'EFTPOS' },
        expectCategory: ['Groceries'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: -1 },
  }),
  receiptCase({
    id: 'quick-faded-thermal',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['degraded:fade', 'MYR', 'category'],
    notes:
      'Faded thermal paper from a petrol station, low contrast. Fuel should map to the Petrol category.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'PETRONAS SS2',
        header: ['Jalan SS2/72, Petaling Jaya'],
        date: '2026-09-16',
        dateFormat: 'DD/MM/YYYY',
        time: '07:11',
        meta: ['PUMP 06   RON95'],
        items: [{ name: 'RON95 29.07L @ 2.05', unit: 59.59 }],
        rounding: true,
        payment: { method: 'DEBIT', last4: '8812' },
        expectCategory: ['Petrol'],
        expectNote: ['PETRONAS SS2', 'Petronas'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: 2, fade: 0.65 },
  }),
  receiptCase({
    id: 'quick-blurry',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['degraded:blur', 'GBP'],
    notes: 'Motion-blurred phone photo of a cafe receipt. Readable with effort.',
    input: { currency: 'GBP', categories: CAT_NESTED },
    receipts: [
      {
        currency: 'GBP',
        merchant: 'FLAT WHITE CO.',
        header: ['17 Berwick St, London'],
        date: '2026-09-30',
        dateFormat: 'DD/MM/YYYY',
        time: '08:05',
        items: [
          { name: 'Flat White', qty: 2, unit: 3.6 },
          { name: 'Almond Croissant', unit: 3.95 },
        ],
        payment: { method: 'CONTACTLESS' },
        expectCategory: ['Coffee', 'Dining out', 'Food'],
      },
    ],
    scene: { kind: 'photo', background: 'dark', rotate: -6, blur: 1.6 },
  }),
  receiptCase({
    id: 'quick-sideways',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['degraded:rotation', 'PHP'],
    notes: 'Photo taken sideways (receipt rotated 90 degrees). The model has to read rotated text.',
    input: { currency: 'PHP', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'PHP',
        merchant: 'JOLLY CHICKEN JOINT',
        header: ['SM Megamall, Mandaluyong'],
        date: '2026-09-27',
        dateFormat: 'MM/DD/YYYY',
        time: '12:44',
        items: [
          { name: '2pc Chicken w/ Rice', qty: 2, unit: 189 },
          { name: 'Spaghetti', unit: 75 },
          { name: 'Pineapple Juice', qty: 2, unit: 55 },
        ],
        tax: { label: 'VAT 12% (incl.) {tax}', rate: 0.12, inclusive: true },
        payment: { tendered: 1000 },
        expectCategory: ['Food'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', sideways: true },
  }),
  receiptCase({
    id: 'quick-dim-noisy',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['degraded:light', 'degraded:noise', 'MYR'],
    notes: 'Shadow across half the receipt plus sensor noise, as in a dim restaurant.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [{ ...myRestaurant, date: '2026-09-12' }],
    scene: { kind: 'photo', background: 'dark', rotate: 3, light: 1, noise: 0.6 },
  }),
  receiptCase({
    id: 'quick-old-date-clamped',
    mode: 'quick',
    tags: ['date:old', 'MYR'],
    notes:
      'The receipt is from March 2025, well over 30 days before "today" (2026-10-01). The model should read the printed date; the Worker then clamps it to today, so the app-facing date is 2026-10-01 by design.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [{ ...kopitiam, merchant: 'KEDAI KOPI LAMA', date: '2025-03-14' }],
    scene: { kind: 'photo', background: 'wood', rotate: 1 },
  }),
  receiptCase({
    id: 'quick-no-date',
    mode: 'quick',
    difficulty: 'easy',
    tags: ['date:missing', 'MYR'],
    notes:
      'No date anywhere on the receipt. The model must return null (not invent one); the Worker then posts it today.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'PASAR MALAM STALL 23',
        items: [
          { name: 'Apam Balik', unit: 5.0 },
          { name: 'Air Tebu', qty: 2, unit: 3.5 },
        ],
        expectCategory: ['Food'],
        footer: ['TERIMA KASIH'],
      },
    ],
    scene: { kind: 'photo', background: 'fabric', rotate: -2 },
  }),
  receiptCase({
    id: 'quick-day-month-only',
    mode: 'quick',
    tags: ['date:no-year', 'SGD'],
    notes:
      'Date printed as "24 SEP" with no year. The prompt asks for the most recent plausible year; month and day must be right.',
    input: { currency: 'SGD', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'SGD',
        merchant: 'HAWKER 88 CHICKEN RICE',
        header: ['Maxwell Food Centre #01-10'],
        date: '2026-09-24',
        dateFormat: 'DD MMM',
        time: '12:15',
        items: [
          { name: 'Chicken Rice', qty: 2, unit: 5.5 },
          { name: 'Barley', qty: 2, unit: 1.8 },
        ],
        expectCategory: ['Food'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: 2 },
  }),
  receiptCase({
    id: 'quick-us-date-order',
    mode: 'quick',
    tags: ['date:format', 'USD'],
    notes: 'US receipt printed 09/05/2026: in a US context that is September 5, not May 9.',
    input: { currency: 'USD', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'USD',
        merchant: 'HOME & HARDWARE DEPOT',
        header: ['Austin, TX 78704'],
        date: '2026-09-05',
        dateFormat: 'MM/DD/YYYY',
        time: '10:22 AM',
        items: [
          { name: 'Drill Bit Set', unit: 24.97 },
          { name: 'Wood Screws 100ct', qty: 2, unit: 6.48 },
          { name: 'Painters Tape', unit: 5.98 },
        ],
        tax: { label: 'Sales Tax 8.25%', rate: 0.0825 },
        payment: { method: 'VISA', last4: '4242' },
        expectCategory: ['Shopping', 'Housing', 'Other'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: -2 },
  }),
  receiptCase({
    id: 'quick-utility-bill',
    mode: 'quick',
    difficulty: 'hard',
    tags: ['bill', 'MYR', 'trap:previous-balance'],
    notes:
      'An electricity bill, not a till receipt. "Previous balance" and "Payment received" are printed near the top; the amount to record is TOTAL AMOUNT DUE (the current charges).',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'TENAGA BILL - ELECTRICITY',
        header: ['Account No: 2200 1456 7890', 'Bill date: 15/09/2026'],
        date: '2026-09-15',
        dateFormat: 'DD/MM/YYYY',
        dateLabel: 'Bill date ',
        meta: [
          'Previous balance       RM 132.40',
          'Payment received      -RM 132.40',
          'Usage 412 kWh',
        ],
        items: [
          { name: 'Energy charge', unit: 141.62 },
          { name: 'Capacity charge', unit: 18.95 },
          { name: 'Network charge', unit: 23.11 },
          { name: 'Retail charge', unit: 10.0 },
        ],
        tax: { label: 'SST 8%', rate: 0.08 },
        rounding: true,
        labels: { total: 'TOTAL AMOUNT DUE' },
        footer: ['Pay by 30/09/2026'],
        expectCategory: ['Utilities'],
        expectNote: ['Tenaga', 'TENAGA BILL - ELECTRICITY', 'Tenaga electricity'],
      },
    ],
    scene: { kind: 'scan' },
  }),
  receiptCase({
    id: 'quick-no-other-category',
    mode: 'quick',
    tags: ['category', 'USD'],
    notes:
      'The user has no "Other" category. A hardware/home store purchase should pick the closest general category (Home).',
    input: { currency: 'USD', categories: CAT_NO_OTHER },
    receipts: [
      {
        currency: 'USD',
        merchant: 'ACE NEIGHBORHOOD HARDWARE',
        date: '2026-09-28',
        dateFormat: 'MM/DD/YYYY',
        items: [
          { name: 'LED Bulbs 4pk', unit: 11.99 },
          { name: 'Extension Cord', unit: 14.49 },
        ],
        tax: { label: 'Tax 7%', rate: 0.07 },
        expectCategory: ['Home'],
      },
    ],
    scene: { kind: 'photo', background: 'white', rotate: 1 },
  }),
  receiptCase({
    id: 'quick-nested-coffee',
    mode: 'quick',
    difficulty: 'easy',
    tags: ['category', 'USD'],
    notes:
      'Coffee shop with a nested category tree available: the specific "Coffee" subcategory is best, "Dining out"/"Food" acceptable.',
    input: { currency: 'USD', categories: CAT_NESTED },
    receipts: [
      {
        currency: 'USD',
        merchant: 'BLUE HERON COFFEE',
        date: '2026-09-29',
        dateFormat: 'MM/DD/YYYY',
        time: '7:52 AM',
        items: [
          { name: 'Oat Latte 16oz', unit: 5.75 },
          { name: 'Blueberry Muffin', unit: 3.5 },
        ],
        tax: { label: 'Tax', rate: 0.0725 },
        payment: { method: 'APPLE PAY' },
        expectCategory: ['Coffee', 'Dining out', 'Food'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: -3 },
  }),
  receiptCase({
    id: 'quick-card-terminal-slip',
    mode: 'quick',
    tags: ['slip', 'MYR'],
    notes:
      'A card-terminal merchant copy (no item list, just SALE amount and approval). It is still a receipt: one expense for the sale amount.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'UNIQLO MID VALLEY',
        header: ['MID: 000001234567', 'TID: 88001234'],
        date: '2026-09-21',
        dateFormat: 'DD/MM/YYYY',
        time: '14:09',
        meta: ['VISA CREDIT  ************4242', 'SALE'],
        items: [{ name: 'AMOUNT', unit: 179.8 }],
        labels: { total: 'TOTAL' },
        footer: ['APPROVED 044519', 'NO SIGNATURE REQUIRED', 'CUSTOMER COPY'],
        expectCategory: ['Shopping'],
        expectNote: ['UNIQLO MID VALLEY', 'Uniqlo'],
      },
    ],
    scene: { kind: 'photo', background: 'dark', rotate: 2 },
  }),
  receiptCase({
    id: 'quick-hkd-chinese',
    mode: 'quick',
    tags: ['HKD', 'locale', 'trap:tendered', 'script:zh'],
    notes:
      'Hong Kong cha chaan teng receipt in Traditional Chinese: 合計 is the total, 現金 is cash tendered (larger), 找續 is change. The user runs the app in zh-Hant, so the category must be one of the Chinese names exactly.',
    input: { currency: 'HKD', categories: CAT_ZH_HANT },
    receipts: [
      {
        currency: 'HKD',
        merchant: '金華冰廳',
        header: ['旺角弼街47號', '電話 2392 6830'],
        date: '2026-09-26',
        dateFormat: 'YYYY/MM/DD',
        time: '15:12',
        font: 'jp',
        items: [
          { name: '菠蘿油', qty: 2, unit: 15 },
          { name: '凍奶茶', qty: 2, unit: 22 },
          { name: '火腿通粉', unit: 38 },
        ],
        service: { label: '加一服務費', rate: 0.1 },
        labels: { total: '合計', subtotal: '小計', tendered: '現金', change: '找續' },
        payment: { tendered: 200 },
        footer: ['多謝光臨'],
        expectCategory: ['餐飲'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: 2 },
  }),
  receiptCase({
    id: 'quick-thai-script',
    mode: 'quick',
    tags: ['THB', 'locale', 'script:th', 'category'],
    notes:
      'Thai-language receipt (labels in Thai script: รวมทั้งสิ้น is the grand total, เงินสด cash tendered, เงินทอน change) from a user with English categories, so the model must map a Thai grocery receipt onto "Groceries".',
    input: { currency: 'THB', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'THB',
        merchant: 'ตลาดสดสุขุมวิท',
        header: ['ซอยสุขุมวิท 23 กรุงเทพฯ'],
        date: '2026-09-27',
        dateFormat: 'DD/MM/YYYY',
        time: '10:05',
        font: 'sans',
        items: [
          { name: 'ข้าวหอมมะลิ 5 กก.', unit: 189 },
          { name: 'ไข่ไก่ 10 ฟอง', unit: 52 },
          { name: 'น้ำปลา', qty: 2, unit: 35 },
          { name: 'ผักบุ้ง', unit: 20 },
        ],
        tax: { label: 'VAT 7% รวมแล้ว {tax}', rate: 0.07, inclusive: true },
        labels: { total: 'รวมทั้งสิ้น', subtotal: 'รวม', tendered: 'เงินสด', change: 'เงินทอน' },
        payment: { tendered: 500 },
        expectCategory: ['Groceries'],
        expectNote: ['ตลาดสดสุขุมวิท', 'Sukhumvit fresh market'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: -2 },
  }),
];

// Non-receipt paper: expected output is an empty transactions array.
const menuSvg = (() => {
  const items = [
    ['Nasi Lemak Ayam', '14.90'],
    ['Mee Goreng Mamak', '11.50'],
    ['Roti Canai (2pcs)', '3.80'],
    ['Teh Tarik', '3.20'],
    ['Milo Dinosaur', '6.50'],
    ['Cendol', '7.90'],
  ];
  const rows = items
    .map(
      ([name, price], i) =>
        `<text x="60" y="${260 + i * 70}" font-family="Georgia, serif" font-size="34" fill="#3b2a1a">${escapeXml(name)}</text><text x="680" y="${260 + i * 70}" text-anchor="end" font-family="Georgia, serif" font-size="34" fill="#3b2a1a">${price}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="760"><rect width="100%" height="100%" fill="#f6ecd9"/><text x="370" y="120" text-anchor="middle" font-family="Georgia, serif" font-size="56" font-weight="bold" fill="#7a1f1f">MENU</text><text x="370" y="175" text-anchor="middle" font-family="Georgia, serif" font-size="26" fill="#7a1f1f">Prices in RM. 6% SST applies.</text>${rows}</svg>`;
})();

const emptyTableSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#ffffff" opacity="0"/><circle cx="150" cy="100" r="80" fill="#ffffff"/><circle cx="150" cy="100" r="60" fill="#6f4e37"/></svg>';

const notReceipts = [
  {
    id: 'quick-no-receipt-coffee-cup',
    mode: 'quick',
    difficulty: 'easy',
    tags: ['no-receipt'],
    notes:
      'A photo of a coffee cup on a table, no receipt. Expected {"transactions":[]}; any transaction is a hallucination.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    image: {
      type: 'paper',
      svg: emptyTableSvg,
      scene: { kind: 'photo', background: 'wood', shadow: false },
    },
    expect: { transactions: [] },
  },
  {
    id: 'quick-no-receipt-menu',
    mode: 'quick',
    difficulty: 'medium',
    tags: ['no-receipt', 'trap:menu'],
    notes:
      'A restaurant menu with prices. It is not a receipt (nothing was bought), so expected {"transactions":[]}. Reporting a menu price or a sum of prices is wrong.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    image: {
      type: 'paper',
      svg: menuSvg,
      scene: { kind: 'photo', background: 'dark', rotate: -2 },
    },
    expect: { transactions: [] },
  },
];

// --- itemized ----------------------------------------------------------------------

const itemized = [
  receiptCase({
    id: 'itemized-kopitiam-qty',
    mode: 'itemized',
    difficulty: 'easy',
    tags: ['baseline', 'quantity'],
    notes: 'Three lines, one with quantity 2 (lineTotal 5.60 for both). Baseline.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [kopitiam],
    scene: { kind: 'scan' },
    detailCurrencies: ['MYR'],
  }),
  receiptCase({
    id: 'itemized-service-sst-excluded',
    mode: 'itemized',
    tags: ['exclusions', 'rounding', 'quantity'],
    notes:
      'Six dishes plus service 10%, SST 6% and rounding. Items are the six purchased lines only (pre-tax line totals); service, SST and rounding must NOT appear as items. Transaction amount is the final TOTAL.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: [{ ...myRestaurant, expectCategory: ['Makan'] }],
    scene: { kind: 'photo', background: 'marble', rotate: -2 },
    detailCurrencies: ['MYR'],
  }),
  receiptCase({
    id: 'itemized-qty-at',
    mode: 'itemized',
    tags: ['quantity'],
    notes:
      'Quantities printed as "NAME 3 @ 1.20" with the line total on the right. quantity must be the count and lineTotal the line total for all units.',
    input: { currency: 'SGD', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'SGD',
        merchant: 'KOPI & TOAST',
        header: ['Tiong Bahru Market'],
        date: '2026-09-26',
        dateFormat: 'DD/MM/YYYY',
        itemStyle: 'qtyAt',
        items: [
          { name: 'Kaya Toast Set', qty: 2, unit: 5.8 },
          { name: 'Kopi C', qty: 3, unit: 1.6 },
          { name: 'Soft Boiled Egg', qty: 4, unit: 0.9 },
          { name: 'Peanut Butter Toast', unit: 2.5 },
        ],
        expectCategory: ['Food'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: 2 },
    detailCurrencies: ['SGD', null],
  }),
  receiptCase({
    id: 'itemized-qty-own-line',
    mode: 'itemized',
    tags: ['quantity', 'layout'],
    notes:
      'Quantity on its own line under the item name ("  3 x 2.49"). The two lines are ONE item: never split them or count the quantity line as a second item.',
    input: { currency: 'GBP', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'GBP',
        merchant: 'CORNER LOCAL',
        date: '2026-09-25',
        dateFormat: 'DD/MM/YYYY',
        itemStyle: 'qtyLine',
        items: [
          { name: 'Semi Skimmed Milk 2pt', qty: 2, unit: 1.45 },
          { name: 'Sourdough', unit: 2.95 },
          { name: 'Baked Beans', qty: 3, unit: 0.89 },
          { name: 'Cheddar 400g', unit: 3.75 },
        ],
        payment: { method: 'CONTACTLESS' },
        expectCategory: ['Groceries'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: -1 },
    detailCurrencies: ['GBP'],
  }),
  receiptCase({
    id: 'itemized-weighed',
    mode: 'itemized',
    tags: ['quantity:weight'],
    notes:
      'Produce sold by weight ("0.452 kg @ 12.90/kg"). quantity may be the weight (0.452) and lineTotal the weighed price. Do not use the per-kg price as lineTotal.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'VILLAGE GROCER',
        header: ['Bangsar Village'],
        date: '2026-09-28',
        dateFormat: 'DD/MM/YYYY',
        items: [
          { name: 'Fuji Apple', qty: 0.452, unit: 12.9, unitLabel: 'kg' },
          { name: 'Salmon Fillet', qty: 0.318, unit: 89.0, unitLabel: 'kg' },
          { name: 'Fresh Milk 1L', unit: 8.95 },
        ],
        payment: { method: 'VISA', last4: '4242' },
        expectCategory: ['Groceries'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: 1 },
    detailCurrencies: ['MYR'],
  }),
  receiptCase({
    id: 'itemized-line-discount',
    mode: 'itemized',
    tags: ['discount:line'],
    notes:
      'One item has its own DISC line underneath. Fold the per-item discount into that item: its lineTotal is price minus discount, and the DISC line is not an item.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'WATSONS 1 UTAMA',
        date: '2026-09-22',
        dateFormat: 'DD/MM/YYYY',
        items: [
          { name: 'Sunscreen SPF50', unit: 45.9, discount: 9.18, discountLabel: 'PROMO 20%' },
          { name: 'Cotton Pads', unit: 6.5 },
          { name: 'Shampoo 400ml', unit: 22.9, discount: 5.0, discountLabel: 'MEMBER DISC' },
        ],
        payment: { method: 'DEBIT', last4: '8812' },
        expectCategory: ['Shopping', 'Healthcare'],
      },
    ],
    scene: { kind: 'photo', background: 'white', rotate: -2 },
    detailCurrencies: ['MYR'],
  }),
  receiptCase({
    id: 'itemized-receipt-discount',
    mode: 'itemized',
    tags: ['discount:receipt', 'exclusions'],
    notes:
      'A receipt-level member discount (10% off the subtotal) plus GST. Items keep their undiscounted prices; the discount and GST lines are NOT items. Transaction amount is the final TOTAL.',
    input: { currency: 'SGD', categories: CAT_NESTED },
    receipts: [quick.find((c) => c.id === 'quick-member-discount-gst').image.receipts[0]],
    scene: { kind: 'photo', background: 'fabric', rotate: 1 },
    detailCurrencies: ['SGD', null],
  }),
  receiptCase({
    id: 'itemized-jp',
    mode: 'itemized',
    difficulty: 'hard',
    tags: ['JPY', 'locale'],
    notes:
      'Japanese item names (keep them as printed or a faithful reading); yen line totals have no decimals. Tax is included and is not an item.',
    input: { currency: 'JPY', categories: CAT_JA },
    receipts: [quick.find((c) => c.id === 'quick-jp-konbini-inclusive').image.receipts[0]],
    scene: { kind: 'photo', background: 'dark', rotate: -3 },
    detailCurrencies: ['JPY'],
  }),
  receiptCase({
    id: 'itemized-pos-abbreviations',
    mode: 'itemized',
    tags: ['abbreviations'],
    notes:
      'POS-truncated names ("CHKN RICE LG"). Keeping the printed abbreviation or expanding it sensibly are both fine; inventing a different dish is not.',
    input: { currency: 'USD', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'USD',
        merchant: 'GOLDEN WOK EXPRESS',
        date: '2026-09-27',
        dateFormat: 'MM/DD/YYYY',
        items: [
          { name: 'CHKN RICE LG', unit: 11.95, aliases: ['Chicken Rice Large'] },
          { name: 'ORNG CHKN', unit: 12.5, aliases: ['Orange Chicken'] },
          { name: 'VEG LO MEIN', unit: 9.95, aliases: ['Vegetable Lo Mein'] },
          { name: 'EGG RL 2PC', unit: 3.5, aliases: ['Egg Roll 2pc', 'Egg Rolls'] },
          { name: 'FTN DRK', qty: 2, unit: 2.25, aliases: ['Fountain Drink'] },
        ],
        tax: { label: 'TAX', rate: 0.0625 },
        expectCategory: ['Food'],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: 3 },
    detailCurrencies: ['USD', null],
  }),
  receiptCase({
    id: 'itemized-long-15',
    mode: 'itemized',
    difficulty: 'hard',
    tags: ['long', 'completeness'],
    notes:
      'Fifteen lines. Completeness matters: every line must appear, in order, with the right line total.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'LOTUS FRESH MARKET',
        header: ['Kepong'],
        date: '2026-09-23',
        dateFormat: 'DD/MM/YYYY',
        fontSize: 18,
        items: [
          ['Jasmine Rice 5kg', 1, 27.9],
          ['Cooking Oil 2kg', 1, 14.5],
          ['Chicken Whole', 1, 18.6],
          ['Ikan Kembung', 1, 12.4],
          ['Sawi', 2, 2.5],
          ['Tomato', 1, 3.2],
          ['Onion 1kg', 1, 4.9],
          ['Garlic', 1, 3.8],
          ['Soy Sauce', 1, 6.2],
          ['Instant Noodles 5s', 2, 5.4],
          ['Bread', 1, 4.3],
          ['Eggs 30s', 1, 13.9],
          ['Detergent 3kg', 1, 22.9],
          ['Tissue 10 rolls', 1, 15.9],
          ['Dish Soap', 1, 4.5],
        ].map(([name, qty, unit]) => ({ name, qty, unit })),
        rounding: true,
        payment: { method: 'DEBIT', last4: '8812' },
        expectCategory: ['Groceries'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: -1 },
    detailCurrencies: ['MYR'],
  }),
  receiptCase({
    id: 'itemized-multi-receipt-no-detail',
    mode: 'itemized',
    tags: ['multi-receipt', 'schema'],
    notes:
      'Two receipts in one photo. The prompt says emit one transaction per receipt and OMIT receiptDetail entirely for multi-receipt images.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM },
    receipts: quick.find((c) => c.id === 'quick-two-receipts').image.receipts,
    scene: { kind: 'photo', background: 'wood', rotate: [-5, 4] },
  }),
  receiptCase({
    id: 'itemized-dollar-ambiguous-currency',
    mode: 'itemized',
    tags: ['currency-detect'],
    notes:
      'Receipt shows only "$" with a Singapore address and GST. receiptDetail.currency should be SGD (from context) or null if unsure; USD is a guess the prompt forbids.',
    input: { currency: 'SGD', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'AUD',
        merchant: 'THE BOOK NOOK',
        header: ['Raffles City #03-12, Singapore 179103', 'GST Reg No: M2-0123456-7'],
        symbolOnLines: true,
        date: '2026-09-20',
        dateFormat: 'DD/MM/YYYY',
        items: [
          { name: 'Paperback Novel', unit: 18.9 },
          { name: 'Notebook A5', qty: 2, unit: 6.5 },
          { name: 'Bookmark', unit: 2.0 },
        ],
        tax: { label: 'GST 9% (incl.) {tax}', rate: 0.09, inclusive: true },
        expectCategory: ['Shopping'],
      },
    ],
    scene: { kind: 'photo', background: 'white', rotate: 2 },
    detailCurrencies: ['SGD', null],
  }),
  receiptCase({
    id: 'itemized-faded',
    mode: 'itemized',
    difficulty: 'hard',
    tags: ['degraded:fade', 'confidence'],
    notes:
      'Faded thermal print. Items should still be read; "low" confidence is appropriate where text is hard to read. Invented items are worse than marking low confidence.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        ...kopitiam,
        merchant: 'KEDAI KOPI SIN HUAT',
        date: '2026-09-18',
        items: [
          ...kopitiam.items,
          { name: 'Nasi Lemak Biasa', unit: 4.0 },
          { name: 'Teh Tarik', unit: 2.6 },
        ],
      },
    ],
    scene: { kind: 'photo', background: 'wood', rotate: 2, fade: 0.7, blur: 0.6 },
    detailCurrencies: ['MYR', null],
  }),
  receiptCase({
    id: 'itemized-modifiers',
    mode: 'itemized',
    tags: ['modifiers'],
    notes:
      'Cafe drinks with unpriced modifier lines ("- oat milk", "- less ice"). Modifiers are not separate items.',
    input: { currency: 'MYR', categories: CAT_NESTED },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'BEAN THERE CAFE',
        date: '2026-09-29',
        dateFormat: 'DD/MM/YYYY',
        time: '09:10',
        items: [
          { name: 'Iced Latte', unit: 14.0, modifiers: ['- oat milk', '- less ice'] },
          { name: 'Matcha Latte', unit: 15.0, modifiers: ['- 50% sugar'] },
          { name: 'Butter Croissant', unit: 9.0, modifiers: ['- warmed'] },
        ],
        tax: { label: 'SST 6%', rate: 0.06 },
        expectCategory: ['Coffee', 'Dining out', 'Food'],
      },
    ],
    scene: { kind: 'photo', background: 'marble', rotate: -2 },
    detailCurrencies: ['MYR'],
  }),
  receiptCase({
    id: 'itemized-handwritten-tip-excluded',
    mode: 'itemized',
    difficulty: 'hard',
    tags: ['trap:tip', 'exclusions'],
    notes:
      'Handwritten tip on a US slip: the transaction amount is the handwritten total, but the tip is never an item (items are the three dishes/drinks only).',
    input: { currency: 'USD', categories: CAT_DEFAULT },
    receipts: [quick.find((c) => c.id === 'quick-handwritten-tip').image.receipts[0]],
    scene: { kind: 'photo', background: 'wood', rotate: 3 },
    detailCurrencies: ['USD'],
  }),
  receiptCase({
    id: 'itemized-voided-line',
    mode: 'itemized',
    tags: ['void', 'exclusions'],
    notes:
      'One line was rung up and then voided on the spot ("** VOID **" with the negative amount underneath). The voided item was never bought: it must not appear as an item, and the total excludes it.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    receipts: [
      {
        currency: 'MYR',
        merchant: 'KK SUPER MART',
        header: ['Taman Tun Dr Ismail'],
        date: '2026-09-28',
        dateFormat: 'DD/MM/YYYY',
        items: [
          { name: 'Mineral Water 1.5L', qty: 2, unit: 2.2 },
          { name: 'Gardenia Bread', unit: 4.3 },
          { name: 'Kaya Jar', unit: 7.9 },
        ],
        voidLines: [{ name: 'Marlboro Red 20s', unit: 17.0 }],
        rounding: true,
        payment: { tendered: 50 },
        expectCategory: ['Groceries'],
      },
    ],
    scene: { kind: 'photo', background: 'dark', rotate: 1 },
    detailCurrencies: ['MYR'],
  }),
  {
    id: 'itemized-no-receipt-menu',
    mode: 'itemized',
    difficulty: 'medium',
    tags: ['no-receipt', 'trap:menu'],
    notes:
      'A menu, not a receipt: expected {"transactions":[]} with no receiptDetail. Listing menu dishes as items is a hallucination.',
    input: { currency: 'MYR', categories: CAT_DEFAULT },
    image: { type: 'paper', svg: menuSvg, scene: { kind: 'photo', background: 'wood', rotate: 2 } },
    expect: { transactions: [], receiptDetail: null },
  },
];

// --- screenshot -------------------------------------------------------------------

const ACCOUNTS_MY = [
  'Cash',
  'Maybank Savings',
  'Everyday Debit',
  'Visa 4242',
  'Visa Platinum 9911',
  'GrabPay Wallet',
  'TNG eWallet',
];

function screenCase({
  id,
  template,
  data,
  input,
  expect,
  difficulty = 'medium',
  tags = [],
  notes,
}) {
  return {
    id,
    mode: 'screenshot',
    difficulty,
    tags,
    notes,
    input,
    image: { type: 'screen', template, data },
    expect: { transactions: expect },
  };
}

const screenshot = [
  screenCase({
    id: 'screenshot-wallet-visa-last4',
    template: 'walletPayment',
    tags: ['account:last4'],
    notes:
      'Paid with "Visa •••• 4242"; the user has "Visa 4242" and "Visa Platinum 9911". The last four digits make "Visa 4242" the one clear match.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      app: 'PayNow Wallet',
      amountText: 'RM 23.90',
      merchant: 'Tealive Bangsar',
      rows: [
        ['Date', '27 Sep 2026, 13:42'],
        ['Paid with', 'Visa •••• 4242'],
        ['Reference No.', 'TX88230419'],
        ['Status', 'Completed'],
      ],
    },
    expect: [
      {
        amount: 23.9,
        date: '2026-09-27',
        category: ['Coffee', 'Makan'],
        note: ['Tealive Bangsar', 'Tealive'],
        account: 'Visa 4242',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-wallet-name-match',
    template: 'walletPayment',
    difficulty: 'easy',
    tags: ['account:wallet'],
    notes:
      'A GrabPay payment screen; the user account is named "GrabPay Wallet". Clear single match.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      app: 'GrabPay',
      accent: '#00b14f',
      title: 'Payment successful',
      amountText: 'RM 18.00',
      merchant: 'GrabCar to KLCC',
      rows: [
        ['Date', '29 Sep 2026, 08:15'],
        ['Payment method', 'GrabPay Wallet'],
        ['Booking ID', 'A-6Q2XK9PWW'],
      ],
    },
    expect: [
      {
        amount: 18.0,
        date: '2026-09-29',
        category: ['Grab'],
        note: ['GrabCar to KLCC', 'GrabCar', 'Grab'],
        account: 'GrabPay Wallet',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-bank-detail-debit',
    template: 'bankTxnDetail',
    tags: ['account:name'],
    notes:
      'Bank transaction detail: "Everyday Debit ••8812" maps to the "Everyday Debit" account. The amount is shown with a minus sign; report it as a positive expense.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      merchant: 'Jaya Grocer',
      amountText: '-RM 86.45',
      rows: [
        ['Account', 'Everyday Debit ••8812'],
        ['Transaction date', '25 Sep 2026'],
        ['Type', 'Card purchase'],
        ['Description', 'POS JAYA GROCER EMPIRE'],
      ],
    },
    expect: [
      {
        amount: 86.45,
        date: '2026-09-25',
        category: ['Groceries'],
        note: ['Jaya Grocer'],
        account: 'Everyday Debit',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-ambiguous-two-visas',
    template: 'walletPayment',
    tags: ['account:ambiguous'],
    notes:
      'Says only "Paid with Visa" (no digits) while the user has two Visa accounts. The prompt says never guess between two candidates: account must be "". Picking either Visa is a wrong-account error.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      amountText: 'RM 42.00',
      merchant: 'Popular Bookstore',
      rows: [
        ['Date', '24 Sep 2026, 16:20'],
        ['Paid with', 'Visa'],
        ['Reference No.', 'TX88199302'],
      ],
    },
    expect: [
      {
        amount: 42.0,
        date: '2026-09-24',
        category: ['Shopping'],
        note: ['Popular Bookstore', 'Popular'],
        account: '',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-no-source-shown',
    template: 'walletPayment',
    difficulty: 'easy',
    tags: ['account:none'],
    notes: 'No payment source anywhere on screen. account must be "".',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      app: 'ParkEasy',
      accent: '#5e5ce6',
      title: 'Parking paid',
      amountText: 'RM 3.00',
      merchant: 'Zone B, Jalan Telawi',
      rows: [
        ['Date', '30 Sep 2026, 19:02'],
        ['Duration', '2 hours'],
        ['Plate', 'WXY 1234'],
      ],
    },
    expect: [
      {
        amount: 3.0,
        date: '2026-09-30',
        category: ['Parking & Toll'],
        note: ['ParkEasy', 'Zone B, Jalan Telawi', 'Parking'],
        account: '',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-no-accounts-list',
    template: 'bankTxnDetail',
    difficulty: 'easy',
    tags: ['account:empty-list'],
    notes:
      'The app sent no account names, so the prompt pins account to "". Any non-empty account is invented.',
    input: { currency: 'USD', categories: CAT_NESTED, accounts: [] },
    data: {
      merchant: 'Shell',
      logoColor: '#fbce07',
      amountText: '-$48.12',
      rows: [
        ['Account', 'Chase Freedom ••3301'],
        ['Date', 'Sep 26, 2026'],
        ['Category', 'Gas'],
      ],
    },
    expect: [
      {
        amount: 48.12,
        date: '2026-09-26',
        category: ['Fuel', 'Transport'],
        note: ['Shell'],
        account: '',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-decoy-last4',
    template: 'emailReceipt',
    tags: ['account:decoy', 'email'],
    notes:
      'Emailed receipt charged to "Mastercard ending in 5521". The user has "Mastercard 1255" (same digits, reordered) and "Mastercard 5521": only the latter matches.',
    input: {
      currency: 'USD',
      categories: CAT_NESTED,
      accounts: ['Cash', 'Mastercard 1255', 'Mastercard 5521', 'Checking'],
    },
    data: {
      subject: 'Your StreamFlix receipt',
      from: 'StreamFlix',
      when: 'Sep 15',
      brand: 'STREAMFLIX',
      lines: [
        'Thanks for being a member.',
        ['Plan', 'Premium (monthly)'],
        ['Billing date', 'September 15, 2026'],
        ['Payment', 'Mastercard ending in 5521'],
        ['Amount paid', '$22.99', true],
      ],
    },
    expect: [
      {
        amount: 22.99,
        date: '2026-09-15',
        category: ['Subscriptions', 'Entertainment'],
        note: ['StreamFlix'],
        account: 'Mastercard 5521',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-lockscreen-notification',
    template: 'lockScreen',
    tags: ['notification', 'noise', 'account:last4'],
    notes:
      'Lock screen with a card-spend notification plus an unrelated chat message. One transaction from the payment notification; the chat is noise.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      dateLine: 'Monday 29 September',
      notifications: [
        {
          app: 'LUMEN BANK',
          color: '#c8102e',
          title: 'Card transaction',
          body: 'You spent RM 18.50 at Tealive Mid Valley with your Visa card ending 4242.',
          time: '2m ago',
        },
        {
          app: 'MESSAGES',
          color: '#34c759',
          title: 'Aunty Lim',
          body: 'Dinner at 7pm tonight? Bring the durian!',
          time: '5m ago',
        },
      ],
    },
    expect: [
      {
        amount: 18.5,
        date: '2026-09-29',
        category: ['Coffee', 'Makan'],
        note: ['Tealive Mid Valley', 'Tealive'],
        account: 'Visa 4242',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-lockscreen-promo-noise',
    template: 'lockScreen',
    difficulty: 'hard',
    tags: ['notification', 'noise', 'trap:promo'],
    notes:
      'A real purchase notification next to a promo notification that also contains a money figure ("Spend RM 100, get RM 20 off"). Only the purchase is a transaction.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      dateLine: 'Sunday 28 September',
      notifications: [
        {
          app: 'BAZAARIO',
          color: '#ee4d2d',
          title: '9.9 deals are back!',
          body: 'Spend RM 100 and get RM 20 off with code SAVE20. Today only.',
          time: '1h ago',
        },
        {
          app: 'TNG EWALLET',
          color: '#0064d2',
          title: 'Payment successful',
          body: 'RM 7.20 paid to Family Mart SS15 via TNG eWallet.',
          time: '3m ago',
        },
      ],
    },
    expect: [
      {
        amount: 7.2,
        date: '2026-09-28',
        category: ['Groceries', 'Makan', 'Shopping', 'Other'],
        note: ['Family Mart SS15', 'FamilyMart', 'Family Mart'],
        account: 'TNG eWallet',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-transfer-receipt',
    template: 'transferReceipt',
    tags: ['transfer', 'account:name'],
    notes:
      'A transfer to a person from "Savings Account-i ••0021". "Maybank Savings" is the only savings account, so it is the match. note should be the payee.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      app: 'Maybank2u',
      amountText: 'RM 150.00',
      subtitle: 'Fund transfer',
      rows: [
        ['To', 'TAN WEI MING'],
        ['Recipient bank', 'Lumen Bank'],
        ['From', 'Savings Account-i ••0021'],
        ['Reference', 'Dinner split'],
        ['Date', '26 Sep 2026, 22:10'],
      ],
    },
    expect: [
      {
        amount: 150.0,
        date: '2026-09-26',
        category: ['Makan', 'Gifts', 'Other'],
        note: ['TAN WEI MING', 'Tan Wei Ming'],
        account: 'Maybank Savings',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-txn-list-balance-trap',
    template: 'txnList',
    difficulty: 'hard',
    tags: ['multi-row', 'trap:balance'],
    notes:
      'A list of three card purchases under an account header that also shows "Available balance RM 3,240.55". The balance is not a payment. Expected three transactions, all on "Everyday Debit".',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      accountTitle: 'Everyday Debit',
      accountSub: '•••• 8812',
      balanceText: 'RM 3,240.55',
      items: [
        {
          name: 'Shell Damansara',
          sub: '28 Sep · Card',
          amountText: '-RM 65.00',
          color: '#fbce07',
        },
        {
          name: 'Starbucks Pavilion',
          sub: '27 Sep · Card',
          amountText: '-RM 19.80',
          color: '#00704a',
        },
        {
          name: 'Guardian Pharmacy',
          sub: '27 Sep · Card',
          amountText: '-RM 32.45',
          color: '#e4002b',
        },
      ],
    },
    expect: [
      {
        amount: 65.0,
        date: '2026-09-28',
        category: ['Petrol'],
        note: ['Shell Damansara', 'Shell'],
        account: 'Everyday Debit',
      },
      {
        amount: 19.8,
        date: '2026-09-27',
        category: ['Coffee', 'Makan'],
        note: ['Starbucks Pavilion', 'Starbucks'],
        account: 'Everyday Debit',
      },
      {
        amount: 32.45,
        date: '2026-09-27',
        category: ['Clinic & Pharmacy'],
        note: ['Guardian Pharmacy', 'Guardian'],
        account: 'Everyday Debit',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-order-voucher',
    template: 'orderConfirm',
    tags: ['ecommerce', 'trap:subtotal', 'account:wallet'],
    notes:
      'Order confirmation: Merchandise subtotal, shipping and a voucher discount lead to "Order Total". The amount is the order total, paid with BazaarPay.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: [...ACCOUNTS_MY, 'BazaarPay'] },
    data: {
      orderNo: 'Order #2609-88412',
      items: [
        { name: 'Wireless Earbuds', qty: 1, priceText: 'RM 89.00' },
        { name: 'Phone Case', qty: 2, priceText: 'RM 30.00' },
      ],
      breakdown: [
        ['Merchandise subtotal', 'RM 119.00'],
        ['Shipping', 'RM 4.90'],
        ['Voucher', '-RM 10.00'],
        ['Order Total', 'RM 113.90'],
      ],
      paymentMethod: 'BazaarPay',
    },
    expect: [
      {
        amount: 113.9,
        date: null,
        category: ['Shopping'],
        note: ['Bazaario'],
        account: 'BazaarPay',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-fx-billed-amount',
    template: 'bankTxnDetail',
    difficulty: 'hard',
    tags: ['fx', 'currency-pin'],
    notes:
      'An overseas card charge: the headline is the billed RM 117.80 and the original "USD 25.00 @ 4.712" is shown as detail. The amount actually charged to the user is RM 117.80.',
    input: {
      currency: 'MYR',
      categories: CAT_NESTED,
      accounts: ['Cash', 'Visa 4242', 'Everyday Debit'],
    },
    data: {
      merchant: 'Notion Labs',
      logoColor: '#ffffff',
      amountText: '-RM 117.80',
      rows: [
        ['Card', 'Visa ••4242'],
        ['Original amount', 'USD 25.00'],
        ['Exchange rate', '4.712'],
        ['Posted', '20 Sep 2026'],
      ],
    },
    expect: [
      {
        amount: 117.8,
        date: '2026-09-20',
        category: ['Subscriptions', 'Electronics', 'Other'],
        note: ['Notion Labs', 'Notion'],
        account: 'Visa 4242',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-eu-apple-pay',
    template: 'walletPayment',
    tags: ['EUR', 'number-format', 'account:wallet'],
    notes:
      'European formatting ("12,90 €") paid with Apple Pay; the user has an "Apple Pay" account.',
    input: { currency: 'EUR', categories: CAT_DE, accounts: ['Bargeld', 'Apple Pay', 'Girokonto'] },
    data: {
      app: 'Wallet',
      accent: '#1c1c1e',
      title: 'Zahlung erfolgreich',
      amountText: '12,90 €',
      merchant: 'Bäckerei Schmidt',
      rows: [
        ['Datum', '27.09.2026, 08:31'],
        ['Bezahlt mit', 'Apple Pay'],
        ['Status', 'Abgeschlossen'],
      ],
    },
    expect: [
      {
        amount: 12.9,
        date: '2026-09-27',
        category: ['Lebensmittel', 'Restaurant'],
        note: ['Bäckerei Schmidt'],
        account: 'Apple Pay',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-jp-qr-payment',
    template: 'walletPayment',
    tags: ['JPY', 'locale', 'account:wallet'],
    notes: 'Japanese QR payment ¥1,280 via "PayPon"; category from the Japanese list.',
    input: {
      currency: 'JPY',
      categories: CAT_JA,
      accounts: ['現金', 'PayPon', 'クレジットカード'],
    },
    data: {
      app: 'PayPon',
      accent: '#ff0033',
      title: '支払い完了',
      amountText: '¥1,280',
      merchant: 'らーめん一番 新宿店',
      rows: [
        ['日時', '2026/09/27 12:10'],
        ['支払い方法', 'PayPon残高'],
        ['取引番号', '0927-55102'],
      ],
    },
    expect: [
      {
        amount: 1280,
        date: '2026-09-27',
        category: ['外食', '食費'],
        note: ['らーめん一番 新宿店', 'らーめん一番'],
        account: 'PayPon',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-idr-transfer',
    template: 'transferReceipt',
    tags: ['IDR', 'number-format', 'transfer'],
    notes: 'Indonesian transfer "Rp 85.000" means 85000.',
    input: { currency: 'IDR', categories: CAT_ID, accounts: ['Tunai', 'BCA Tahapan', 'GoPay'] },
    data: {
      app: 'BCA mobile',
      title: 'Transfer Berhasil',
      amountText: 'Rp 85.000',
      rows: [
        ['Penerima', 'DEWI LESTARI'],
        ['Dari', 'BCA Tahapan ••7781'],
        ['Berita', 'Arisan September'],
        ['Tanggal', '25 Sep 2026'],
      ],
    },
    expect: [
      {
        amount: 85000,
        date: '2026-09-25',
        category: ['Lainnya', 'Tagihan'],
        note: ['DEWI LESTARI', 'Dewi Lestari'],
        account: 'BCA Tahapan',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-dark-mode-bank',
    template: 'bankTxnDetail',
    tags: ['dark-mode', 'account:last4'],
    notes:
      'The bank app in dark mode (white text on black). Same reading task: amount, merchant, and "Visa ••4242" maps to "Visa 4242".',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      dark: true,
      merchant: 'Watsons Pavilion',
      logoColor: '#00a19a',
      amountText: '-RM 47.60',
      rows: [
        ['Card', 'Visa ••4242'],
        ['Transaction date', '22 Sep 2026'],
        ['Type', 'Card purchase'],
      ],
    },
    expect: [
      {
        amount: 47.6,
        date: '2026-09-22',
        category: ['Clinic & Pharmacy', 'Shopping'],
        note: ['Watsons Pavilion', 'Watsons'],
        account: 'Visa 4242',
      },
    ],
  }),
  screenCase({
    id: 'screenshot-no-payment-notifications',
    template: 'lockScreen',
    difficulty: 'hard',
    tags: ['no-payment', 'notification', 'noise'],
    notes:
      'A lock screen with no payment at all: a delivery-time update that mentions an order total, a balance alert and a chat message. Nothing was paid here, so the answer is {"transactions":[]}. Auto-log has no review screen, so any transaction is a false entry in the user\'s books.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: ACCOUNTS_MY },
    data: {
      dateLine: 'Tuesday 30 September',
      notifications: [
        {
          app: 'LUMEN BANK',
          color: '#c8102e',
          title: 'Balance alert',
          body: 'Your Everyday Debit balance is RM 1,204.33.',
          time: '10m ago',
        },
        {
          app: 'FOODHERO',
          color: '#ff2b85',
          title: 'Order on the way',
          body: 'Your rider is 5 minutes away. Order total RM 32.40.',
          time: '12m ago',
        },
        {
          app: 'MESSAGES',
          color: '#34c759',
          title: 'Jun',
          body: 'Lunch tomorrow? I can do 12:30.',
          time: '1h ago',
        },
      ],
    },
    expect: [],
  }),
  screenCase({
    id: 'screenshot-cart-not-purchased',
    template: 'orderConfirm',
    tags: ['no-payment', 'ecommerce'],
    notes:
      'A shopping cart before checkout (no payment method, nothing placed). Prices are visible but nothing was bought, so the answer is {"transactions":[]}.',
    input: { currency: 'MYR', categories: CAT_MY_CUSTOM, accounts: [...ACCOUNTS_MY, 'BazaarPay'] },
    data: {
      title: 'Your cart (2)',
      orderNo: 'Checkout to place your order',
      items: [
        { name: 'Air Fryer 4.5L', qty: 1, priceText: 'RM 259.00' },
        { name: 'Silicone Liners', qty: 1, priceText: 'RM 19.90' },
      ],
      breakdown: [
        ['Subtotal', 'RM 278.90'],
        ['Shipping', 'Calculated at checkout'],
      ],
      paymentMethod: 'Not selected',
    },
    expect: [],
  }),
  {
    id: 'screenshot-receipt-photo-card',
    mode: 'screenshot',
    difficulty: 'medium',
    tags: ['receipt-photo', 'account:last4'],
    notes:
      'Screenshot mode also takes photos of paper receipts. The slip shows "MASTERCARD ****5521"; the user has "Mastercard 5521". Amount is the TOTAL after service, SST and rounding.',
    input: {
      currency: 'MYR',
      categories: CAT_MY_CUSTOM,
      accounts: ['Cash', 'Mastercard 1255', 'Mastercard 5521'],
    },
    image: {
      type: 'receipts',
      receipts: [myRestaurant],
      scene: { kind: 'photo', background: 'wood', rotate: 2 },
    },
    expect: {
      transactions: [
        txnFromReceipt(
          { ...myRestaurant, expectCategory: ['Makan'] },
          { account: 'Mastercard 5521' },
        ),
      ],
    },
  },
];

export const HAND_WRITTEN_CASES = [...quick, ...notReceipts, ...itemized, ...screenshot];
