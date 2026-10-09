// Deterministic checks of one model answer against a case's answer key. These
// are the facts (was the amount exactly right? the account? valid JSON?) that
// the Opus judge receives as evidence, and they are also reported on their own
// as strict metrics, so a lenient judgement can never hide a wrong number.

import { clampReceiptDate, extractParsedObject } from './worker.mjs';

const EPS = 0.005;

const norm = (s) =>
  String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Name match: containment either way, or at least half the tokens shared.
 * `others` (line items): the other expected item names. Containment is then
 * refused when the predicted name also contains one of them, which is what a
 * merged line looks like ("Iced Chocolate Latte" for "Iced Chocolate" + "Latte"),
 * while a name with its modifiers folded in ("Iced Latte oat milk") still matches.
 */
export function namesMatch(a, aliases, { others = [] } = {}) {
  const x = norm(a);
  if (!x) return false;
  return aliases.some((alias) => {
    const y = norm(alias);
    if (!y) return false;
    if (x === y) return true;
    const merged = others.map(norm).some((o) => o && !y.includes(o) && x.includes(o));
    if ((x.includes(y) || y.includes(x)) && !merged) return true;
    const xt = new Set(x.split(' '));
    const yt = y.split(' ');
    const shared = yt.filter((t) => xt.has(t)).length;
    return !merged && shared / Math.max(yt.length, xt.size) >= 0.5;
  });
}

const amountEq = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < EPS;

/** Pair predicted rows with expected rows: exact amount first, then by name, then closest amount. */
function pairRows(expected, predicted) {
  const left = predicted.map((p, i) => ({ p, i }));
  const pairs = [];
  const take = (pred) => left.splice(left.indexOf(pred), 1)[0];
  for (const e of expected) {
    const byAmount = left.find(({ p }) => amountEq(p.amount, e.amount));
    const byName = left.find(({ p }) => namesMatch(p.note, e.note ?? []));
    const closest = [...left].sort(
      (a, b) => Math.abs(a.p.amount - e.amount) - Math.abs(b.p.amount - e.amount),
    )[0];
    const chosen = byAmount ?? byName ?? closest;
    pairs.push({ e, p: chosen ? take(chosen).p : null });
  }
  return { pairs, extra: left.map(({ p }) => p) };
}

function rawRows(content) {
  const parsed = extractParsedObject(content);
  return Array.isArray(parsed?.transactions) ? parsed.transactions : [];
}

// The raw rows the Worker keeps (normalizeRow drops non-objects and rows without
// a positive amount), so index i here is the raw form of normalized row i.
const keptByWorker = (raw) =>
  raw.filter(
    (r) => r && typeof r === 'object' && Number.isFinite(Number(r.amount)) && Number(r.amount) > 0,
  );

function checkFormat(content, mode) {
  const trimmed = String(content ?? '').trim();
  let pure = false;
  try {
    JSON.parse(trimmed);
    pure = trimmed.startsWith('{');
  } catch {
    pure = false;
  }
  const parsed = extractParsedObject(trimmed);
  const rows = Array.isArray(parsed?.transactions) ? parsed.transactions : null;
  const required = [
    'type',
    'amount',
    'currency',
    'date',
    'category',
    'note',
    ...(mode === 'screenshot' ? ['account'] : []),
  ];
  const missingKeys = rows
    ? [...new Set(rows.flatMap((r) => required.filter((k) => !(r && k in r))))]
    : required;
  return {
    parseable: parsed !== null && rows !== null,
    pureJson: pure,
    minified: pure && !trimmed.includes('\n'),
    missingKeys,
    chars: trimmed.length,
  };
}

function checkTransactions(kase, final, now) {
  const expected = kase.expect?.transactions ?? [];
  const predicted = final?.transactions ?? [];
  const raw = rawRows(final?.content ?? '');
  const rawKept = keptByWorker(raw);
  const out = {
    expectedCount: expected.length,
    predictedCount: predicted.length,
    countOk: predicted.length === expected.length,
    hallucinated: expected.length === 0 && predicted.length > 0,
    // Rows in the raw output that the Worker's parse dropped (amount 0, missing or unparseable).
    rawRowCount: raw.length,
    droppedByWorker: Math.max(0, raw.length - predicted.length),
    missedAll: expected.length > 0 && predicted.length === 0,
    rows: [],
  };
  const { pairs, extra } = pairRows(expected, predicted);
  out.extraRows = extra.map((p) => ({ amount: p.amount, note: p.note }));
  for (const { e, p } of pairs) {
    if (!p) {
      out.rows.push({ expected: e, missing: true });
      continue;
    }
    const rawRow = rawKept[predicted.indexOf(p)] ?? {};
    const expectedDate = clampReceiptDate(e.date ?? null, now);
    const row = {
      expectedAmount: e.amount,
      amount: p.amount,
      amountOk: amountEq(p.amount, e.amount),
      amountOffBy: Number.isFinite(p.amount) ? Math.round((p.amount - e.amount) * 100) / 100 : null,
      currencyPinned: p.currency === kase.input.currency.toUpperCase(),
      typeOk: p.type === 'expense',
      category: p.category,
      categoryValid: kase.input.categories.includes(p.category),
      categoryBest: e.category?.[0] === p.category,
      categoryAcceptable: (e.category ?? []).includes(p.category),
      note: p.note,
      noteOk: namesMatch(p.note, e.note ?? []),
      date: p.date,
      expectedDate,
      // App-facing date (after the Worker's clamp).
      dateOk: e.monthDayOnly ? p.date.slice(5) === expectedDate.slice(5) : p.date === expectedDate,
      // What the model itself read off the image, before the clamp.
      rawDate: rawRow.date ?? null,
      rawDateOk:
        e.date == null
          ? rawRow.date == null || rawRow.date === ''
          : e.monthDayOnly
            ? String(rawRow.date ?? '').slice(5) === e.date.slice(5)
            : rawRow.date === e.date,
    };
    if (kase.mode === 'screenshot') {
      const want = e.account ?? '';
      const got = p.account ?? '';
      row.expectedAccount = want;
      row.account = got;
      row.accountOk = got === want;
      // wrong = posted to a different real account (the costly error); invented = named one when none applied.
      row.accountError =
        got === want ? null : want === '' ? 'invented' : got === '' ? 'missed' : 'wrong';
    }
    out.rows.push(row);
  }
  return out;
}

function checkDetail(kase, final, now) {
  if (kase.mode !== 'itemized') return null;
  const want = kase.expect?.receiptDetail ?? null;
  const got = final?.receiptDetail ?? null;
  if (!want) return { expectedPresent: false, present: Boolean(got), presenceOk: !got };
  if (!got)
    return { expectedPresent: true, present: false, presenceOk: false, recall: 0, precision: 0 };

  const remaining = got.items.map((it, i) => ({ it, i }));
  const matches = [];
  for (const e of want.items) {
    const names = [e.name, ...(e.aliases ?? [])];
    const others = want.items.filter((o) => o !== e).map((o) => o.name);
    const candidates = remaining.filter(({ it }) => namesMatch(it.name, names, { others }));
    const pick =
      candidates.find(({ it }) => amountEq(it.lineTotal, e.lineTotal)) ??
      candidates[0] ??
      remaining.find(({ it }) => amountEq(it.lineTotal, e.lineTotal));
    if (pick) {
      remaining.splice(remaining.indexOf(pick), 1);
      matches.push({
        expected: e.name,
        got: pick.it.name,
        // False when the item was only paired by price: the line exists but carries the wrong name.
        nameOk: candidates.includes(pick),
        lineTotalOk: amountEq(pick.it.lineTotal, e.lineTotal),
        expectedLineTotal: e.lineTotal,
        lineTotal: pick.it.lineTotal,
        quantityOk: Math.abs(pick.it.quantity - e.quantity) < 0.001,
        expectedQuantity: e.quantity,
        quantity: pick.it.quantity,
      });
    } else matches.push({ expected: e.name, missing: true });
  }
  // An item is right only with the right name AND the right line total.
  const correct = matches.filter((m) => !m.missing && m.nameOk && m.lineTotalOk).length;
  const sum = got.items.reduce((s, it) => s + it.lineTotal, 0);
  return {
    expectedPresent: true,
    present: true,
    presenceOk: true,
    expectedItems: want.items.length,
    predictedItems: got.items.length,
    recall: correct / want.items.length,
    precision: got.items.length ? correct / got.items.length : 0,
    quantityAccuracy: matches.filter((m) => !m.missing).length
      ? matches.filter((m) => m.quantityOk).length / matches.filter((m) => !m.missing).length
      : 0,
    itemsSum: Math.round(sum * 100) / 100,
    expectedItemsSum: want.itemsSubtotal,
    itemsSumOk: Math.abs(sum - want.itemsSubtotal) < 0.01 * Math.max(1, want.items.length),
    extraItems: remaining.map(({ it }) => ({ name: it.name, lineTotal: it.lineTotal })),
    merchant: got.merchant,
    merchantOk: namesMatch(got.merchant, want.merchant ?? []),
    currency: got.currency,
    currencyOk: (want.currency ?? []).includes(got.currency),
    date: got.date,
    dateOk: got.date === clampReceiptDate(want.date ?? null, now),
    itemsConfidence: got.itemsConfidence,
    lowConfidenceItems: got.items.filter((it) => it.confidence === 'low').length,
    items: matches,
  };
}

/** All deterministic checks for one case, plus the single strict pass/fail. */
export function runChecks(kase, scan, now) {
  if (!scan.ok) return { error: scan.error, strictPass: false };
  const final = scan.final;
  const format = checkFormat(final.content, kase.mode);
  // A real photo added without an answer key is judged from the image alone.
  if (!kase.expect) return { format, noAnswerKey: true, strictPass: null };
  const transactions = checkTransactions(kase, final, now);
  const detail = checkDetail(kase, final, now);
  const rowsOk = transactions.rows.every(
    (r) => !r.missing && r.amountOk && (kase.mode !== 'screenshot' || r.accountOk),
  );
  const detailOk =
    !detail ||
    (detail.presenceOk &&
      (!detail.expectedPresent || (detail.recall >= 0.999 && detail.precision >= 0.999)));
  return {
    format,
    transactions,
    detail,
    emptyFirstAttempt: (scan.attempts[0]?.count ?? 0) === 0 && transactions.expectedCount > 0,
    // Strict = the app would get every number (and account / item list) exactly right.
    strictPass: transactions.countOk && rowsOk && detailOk,
  };
}
