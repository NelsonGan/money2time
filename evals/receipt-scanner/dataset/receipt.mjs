// A receipt spec -> its exact money figures + an SVG of the paper slip.
//
// Every figure is computed here in integer minor units, so the answer key is
// derived from the same numbers that get printed and can never disagree with
// the image. Order of operations mirrors a real till: line totals (after any
// per-line discount) -> receipt-level discount -> service charge -> tax ->
// tip -> cash rounding.

const MONEY_STYLES = {
  // symbol, decimals, thousands, decimal mark, where the symbol sits
  MYR: { symbol: 'RM', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  USD: { symbol: '$', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  SGD: { symbol: 'S$', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  GBP: { symbol: '£', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  AUD: { symbol: '$', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  PHP: { symbol: '₱', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  THB: { symbol: '฿', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  HKD: { symbol: 'HK$', decimals: 2, thousands: ',', mark: '.', place: 'prefix' },
  EUR: { symbol: '€', decimals: 2, thousands: '.', mark: ',', place: 'suffix' },
  JPY: { symbol: '¥', decimals: 0, thousands: ',', mark: '.', place: 'prefix' },
  IDR: { symbol: 'Rp', decimals: 0, thousands: '.', mark: ',', place: 'prefix' },
  VND: { symbol: '₫', decimals: 0, thousands: '.', mark: ',', place: 'suffix' },
};

export function moneyStyle(code) {
  const style = MONEY_STYLES[code];
  if (!style) throw new Error(`no money style for ${code}`);
  return { code, ...style };
}

/** Minor units -> printed string, e.g. 123456 -> "1,234.56" / "1.234,56" / "123.456". */
export function formatMinor(minor, style, { symbol = false, sign = false } = {}) {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const scale = 10 ** style.decimals;
  const whole = Math.floor(abs / scale);
  const frac = abs % scale;
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, style.thousands);
  let body =
    style.decimals > 0
      ? `${wholeStr}${style.mark}${String(frac).padStart(style.decimals, '0')}`
      : wholeStr;
  if (symbol)
    body =
      style.place === 'prefix'
        ? `${style.symbol}${style.symbol.length > 1 ? ' ' : ''}${body}`
        : `${body} ${style.symbol}`;
  if (negative) return `-${body}`;
  return sign ? `+${body}` : body;
}

const toMinor = (value, style) => Math.round(value * 10 ** style.decimals);
export const fromMinor = (minor, style) => minor / 10 ** style.decimals;

/**
 * Compute every figure on the slip.
 *
 * spec.items: [{ name, qty = 1, unit, discount = 0, unitLabel, expectName }]
 * spec.receiptDiscount: { label, rate } | { label, amount }
 * spec.service / spec.tax: { label, rate, inclusive }
 * spec.tip: { amount, handwritten }
 * spec.rounding: true -> round the total to the nearest 0.05 (MY/SG cash)
 */
export function computeReceipt(spec) {
  const style = moneyStyle(spec.currency);
  const lines = spec.items.map((item) => {
    const qty = item.qty ?? 1;
    const gross = Math.round(qty * toMinor(item.unit, style));
    const discount = toMinor(item.discount ?? 0, style);
    return {
      ...item,
      qty,
      grossMinor: gross,
      discountMinor: discount,
      lineMinor: gross - discount,
    };
  });
  const itemsMinor = lines.reduce((sum, l) => sum + l.lineMinor, 0);

  let receiptDiscountMinor = 0;
  if (spec.receiptDiscount) {
    receiptDiscountMinor =
      spec.receiptDiscount.amount != null
        ? toMinor(spec.receiptDiscount.amount, style)
        : Math.round(itemsMinor * spec.receiptDiscount.rate);
  }
  const base = itemsMinor - receiptDiscountMinor;
  const serviceMinor = spec.service ? Math.round(base * spec.service.rate) : 0;
  let taxMinor = 0;
  let taxAdded = 0;
  if (spec.tax) {
    if (spec.tax.inclusive) {
      // Printed for information only ("incl. 10% tax"); already inside the prices.
      taxMinor = Math.round(base + serviceMinor - (base + serviceMinor) / (1 + spec.tax.rate));
    } else {
      taxMinor = Math.round((base + serviceMinor) * spec.tax.rate);
      taxAdded = taxMinor;
    }
  }
  const preTipMinor = base + serviceMinor + taxAdded;
  const tipMinor = spec.tip ? toMinor(spec.tip.amount, style) : 0;
  const preRound = preTipMinor + tipMinor;
  let roundingMinor = 0;
  if (spec.rounding && style.decimals === 2)
    roundingMinor = Math.round(preRound / 5) * 5 - preRound;
  const totalMinor = preRound + roundingMinor;

  return {
    style,
    lines,
    itemsMinor,
    receiptDiscountMinor,
    serviceMinor,
    taxMinor,
    preTipMinor,
    tipMinor,
    roundingMinor,
    totalMinor,
    total: fromMinor(totalMinor, style),
  };
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "2026-09-27" in the receipt's own date format. */
export function formatDate(iso, format) {
  const [y, m, d] = iso.split('-');
  const mon = MONTHS[Number(m) - 1];
  switch (format) {
    case 'DD/MM/YYYY':
      return `${d}/${m}/${y}`;
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'DD-MM-YY':
      return `${d}-${m}-${y.slice(2)}`;
    case 'DD.MM.YYYY':
      return `${d}.${m}.${y}`;
    case 'YYYY-MM-DD':
      return iso;
    case 'YYYY/MM/DD':
      return `${y}/${m}/${d}`;
    case 'JP':
      return `${y}年${Number(m)}月${Number(d)}日`;
    case 'DD MMM YYYY':
      return `${d} ${mon} ${y}`;
    case 'MMM DD, YYYY':
      return `${mon.charAt(0)}${mon.slice(1).toLowerCase()} ${Number(d)}, ${y}`;
    case 'DD MMM':
      return `${d} ${mon}`;
    default:
      throw new Error(`unknown date format ${format}`);
  }
}

export const escapeXml = (s) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

const FONTS = {
  mono: "'Courier New', Courier, Menlo, monospace",
  sans: "Helvetica, Arial, 'Hiragino Sans', sans-serif",
  jp: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif",
  hand: "'Bradley Hand', 'Marker Felt', 'Comic Sans MS', cursive",
};

/**
 * Lay the slip out as a list of print lines. Labels default to English; a spec
 * overrides any of them (`labels: { total: '合計' }`).
 */
function printLines(spec, figures) {
  const L = {
    subtotal: 'SUBTOTAL',
    total: 'TOTAL',
    rounding: 'ROUNDING ADJ',
    tendered: 'CASH',
    change: 'CHANGE',
    card: 'CARD',
    qtyAt: '@',
    ...spec.labels,
  };
  const { style } = figures;
  const fmt = (minor, opts) => formatMinor(minor, style, opts);
  const amountCol = (minor) => fmt(minor, { symbol: spec.symbolOnLines ?? false });
  const out = [];
  const push = (line) => out.push(line);

  push({ kind: 'center', text: spec.merchant, bold: true, size: 1.25 });
  for (const h of spec.header ?? []) push({ kind: 'center', text: h, size: 0.85 });
  push({ kind: 'blank' });
  if (spec.date && spec.dateFormat) {
    const dateText = `${spec.dateLabel ?? ''}${formatDate(spec.date, spec.dateFormat)}`;
    push({ kind: 'lr', left: dateText, right: spec.time ?? '' });
  } else if (spec.time) {
    push({ kind: 'lr', left: '', right: spec.time });
  }
  for (const meta of spec.meta ?? []) push({ kind: 'left', text: meta, size: 0.9 });
  push({ kind: 'rule' });

  for (const line of figures.lines) {
    const style2 = spec.itemStyle ?? 'qtyPrefix';
    if (line.unitLabel) {
      // weighed: name, then "0.452 kg @ 12.90/kg      5.83"
      push({ kind: 'left', text: line.name });
      push({
        kind: 'lr',
        left: `  ${line.qty} ${line.unitLabel} ${L.qtyAt} ${fmt(toMinor(line.unit, style))}/${line.unitLabel}`,
        right: amountCol(line.grossMinor),
      });
    } else if (line.qty !== 1 && style2 === 'qtyLine') {
      push({ kind: 'left', text: line.name });
      push({
        kind: 'lr',
        left: `  ${line.qty} x ${fmt(toMinor(line.unit, style))}`,
        right: amountCol(line.grossMinor),
      });
    } else if (line.qty !== 1 && style2 === 'qtyAt') {
      push({
        kind: 'lr',
        left: `${line.name} ${line.qty} ${L.qtyAt} ${fmt(toMinor(line.unit, style))}`,
        right: amountCol(line.grossMinor),
      });
    } else {
      const prefix = style2 === 'qtyPrefix' || line.qty !== 1 ? `${line.qty} ` : '';
      push({ kind: 'lr', left: `${prefix}${line.name}`, right: amountCol(line.grossMinor) });
    }
    for (const mod of line.modifiers ?? []) push({ kind: 'left', text: `   ${mod}`, size: 0.85 });
    if (line.discountMinor) {
      push({
        kind: 'lr',
        left: `   ${line.discountLabel ?? 'DISC'}`,
        right: amountCol(-line.discountMinor),
      });
    }
  }
  // Voided lines: rung up, then cancelled on the spot. Printed, never charged, never an item.
  for (const v of spec.voidLines ?? []) {
    const minor = toMinor(v.unit, style);
    push({ kind: 'lr', left: v.name, right: amountCol(minor) });
    push({ kind: 'lr', left: `   ${L.void ?? '** VOID **'}`, right: amountCol(-minor) });
  }
  push({ kind: 'rule' });

  const showSubtotal =
    spec.showSubtotal ?? Boolean(spec.tax || spec.service || spec.receiptDiscount || spec.tip);
  if (showSubtotal) push({ kind: 'lr', left: L.subtotal, right: amountCol(figures.itemsMinor) });
  if (spec.receiptDiscount)
    push({
      kind: 'lr',
      left: spec.receiptDiscount.label,
      right: amountCol(-figures.receiptDiscountMinor),
    });
  if (spec.service)
    push({ kind: 'lr', left: spec.service.label, right: amountCol(figures.serviceMinor) });
  if (spec.tax && !spec.tax.inclusive)
    push({ kind: 'lr', left: spec.tax.label, right: amountCol(figures.taxMinor) });
  if (spec.tip && !spec.tip.handwritten)
    push({ kind: 'lr', left: spec.tip.label ?? 'TIP', right: amountCol(figures.tipMinor) });
  if (figures.roundingMinor)
    push({ kind: 'lr', left: L.rounding, right: amountCol(figures.roundingMinor) });

  // A handwritten tip means the printed TOTAL is the pre-tip figure and the
  // real total is written underneath by hand, the classic US restaurant slip.
  const printedTotal = spec.tip?.handwritten ? figures.preTipMinor : figures.totalMinor;
  push({
    kind: 'lr',
    left: L.total,
    right: fmt(printedTotal, { symbol: true }),
    bold: true,
    size: 1.2,
  });
  if (spec.tax?.inclusive)
    push({
      kind: 'left',
      text: spec.tax.label.replace('{tax}', fmt(figures.taxMinor)),
      size: 0.85,
    });

  if (spec.tip?.handwritten) {
    push({ kind: 'blank' });
    push({ kind: 'lr', left: 'TIP', right: '', hand: fmt(figures.tipMinor) });
    push({ kind: 'lr', left: 'TOTAL', right: '', hand: fmt(figures.totalMinor) });
    push({ kind: 'blank' });
    push({ kind: 'left', text: 'X ______________________', size: 0.9 });
  }

  const pay = spec.payment;
  if (pay) {
    push({ kind: 'blank' });
    if (pay.tendered != null) {
      const tenderedMinor = toMinor(pay.tendered, style);
      push({ kind: 'lr', left: L.tendered, right: amountCol(tenderedMinor), size: 1.1 });
      push({ kind: 'lr', left: L.change, right: amountCol(tenderedMinor - figures.totalMinor) });
    } else {
      push({
        kind: 'lr',
        left: `${pay.method}${pay.last4 ? ` ****${pay.last4}` : ''}`,
        right: amountCol(figures.totalMinor),
      });
      if (pay.approval) push({ kind: 'left', text: `APPROVAL CODE ${pay.approval}`, size: 0.85 });
    }
  }
  for (const extra of spec.afterTotal ?? [])
    push({ kind: 'lr', left: extra.left, right: extra.right ?? '' });
  push({ kind: 'blank' });
  for (const f of spec.footer ?? ['THANK YOU']) push({ kind: 'center', text: f, size: 0.85 });
  return out;
}

/** The paper slip as an SVG string plus its size. */
export function receiptSvg(spec, figures) {
  const lines = printLines(spec, figures);
  const fontKey = spec.font ?? 'mono';
  const family = FONTS[fontKey];
  const base = spec.fontSize ?? 20;
  const width = spec.paperWidth ?? 460;
  const pad = 26;
  const lh = Math.round(base * 1.38);
  const paper = spec.paperColor ?? '#fbfaf6';
  const ink = spec.inkColor ?? '#1d1d1f';
  let y = pad + lh;
  const parts = [];
  for (const line of lines) {
    const size = Math.round(base * (line.size ?? 1));
    const weight = line.bold ? 'bold' : 'normal';
    const common = `font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${ink}"`;
    if (line.kind === 'blank') {
      y += Math.round(lh * 0.6);
      continue;
    }
    if (line.kind === 'rule') {
      parts.push(
        `<line x1="${pad}" x2="${width - pad}" y1="${y - lh / 2}" y2="${y - lh / 2}" stroke="${ink}" stroke-width="1.4" stroke-dasharray="6 5"/>`,
      );
      y += Math.round(lh * 0.5);
      continue;
    }
    if (line.kind === 'center') {
      parts.push(
        `<text x="${width / 2}" y="${y}" text-anchor="middle" ${common}>${escapeXml(line.text)}</text>`,
      );
    } else if (line.kind === 'left') {
      parts.push(
        `<text x="${pad}" y="${y}" ${common} xml:space="preserve">${escapeXml(line.text)}</text>`,
      );
    } else if (line.kind === 'lr') {
      parts.push(
        `<text x="${pad}" y="${y}" ${common} xml:space="preserve">${escapeXml(line.left)}</text>`,
      );
      if (line.right)
        parts.push(
          `<text x="${width - pad}" y="${y}" text-anchor="end" ${common}>${escapeXml(line.right)}</text>`,
        );
      if (line.hand) {
        parts.push(
          `<text x="${width - pad - 10}" y="${y + 4}" text-anchor="end" font-family="${FONTS.hand}" font-size="${Math.round(base * 1.5)}" fill="#1f3a8a" transform="rotate(-3 ${width - pad} ${y})">${escapeXml(line.hand)}</text>`,
        );
        parts.push(
          `<line x1="${width - pad - 150}" x2="${width - pad}" y1="${y + 8}" y2="${y + 8}" stroke="${ink}" stroke-width="1"/>`,
        );
        y += Math.round(lh * 0.5);
      }
    }
    y += Math.round(lh * (line.size && line.size > 1 ? line.size : 1));
  }
  const height = y + pad;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${paper}"/>${parts.join('')}</svg>`;
  return { svg, width, height };
}
