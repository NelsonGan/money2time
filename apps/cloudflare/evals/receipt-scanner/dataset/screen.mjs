// Phone screenshots for screenshot mode, drawn as SVG at iPhone resolution
// (1179x2556). Each template is the shape of a real payment screen people
// share to the app (wallet confirmation, bank transaction detail, lock-screen
// notification, transfer receipt, transaction list, order confirmation, email
// receipt). App and bank names are fictional; card networks and wallets keep
// their real names because matching them to an account is the feature.

import { escapeXml as x } from './receipt.mjs';

const W = 1179;
const H = 2556;
const SANS = "-apple-system, 'SF Pro Text', Helvetica, Arial, 'Hiragino Sans', sans-serif";

function text(
  tx,
  ty,
  content,
  { size = 44, weight = 400, fill = '#111', anchor = 'start', family = SANS } = {},
) {
  return `<text x="${tx}" y="${ty}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${x(content)}</text>`;
}

function statusBar({ dark = false, time = '9:41' } = {}) {
  const fill = dark ? '#fff' : '#000';
  return `${text(110, 110, time, { size: 50, weight: 600, fill })}<rect x="950" y="78" width="90" height="40" rx="10" fill="none" stroke="${fill}" stroke-width="4"/><rect x="956" y="84" width="66" height="28" rx="6" fill="${fill}"/><rect x="${W / 2 - 190}" y="36" width="380" height="110" rx="55" fill="#000"/>`;
}

function rows(
  startY,
  pairs,
  { labelFill = '#6b6b70', valueFill = '#111', gap = 120, divider = '#e5e5ea' } = {},
) {
  return pairs
    .map(([label, value], i) => {
      const y = startY + i * gap;
      return `${text(80, y, label, { size: 42, fill: labelFill })}${text(W - 80, y, value, { size: 42, weight: 500, fill: valueFill, anchor: 'end' })}<line x1="80" x2="${W - 80}" y1="${y + 45}" y2="${y + 45}" stroke="${divider}" stroke-width="2"/>`;
    })
    .join('');
}

const frame = (body, bg = '#f2f2f7') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`;

/** Wallet / QR payment success screen. */
export function walletPayment(s) {
  const accent = s.accent ?? '#0a84ff';
  return frame(
    `${statusBar()}<rect x="0" y="160" width="${W}" height="1000" fill="${accent}"/>
    ${text(W / 2, 290, s.app ?? 'PayNow Wallet', { size: 48, weight: 600, fill: '#fff', anchor: 'middle' })}
    <circle cx="${W / 2}" cy="520" r="120" fill="#fff"/><path d="M${W / 2 - 55} 520 l40 42 l80 -90" stroke="${accent}" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${text(W / 2, 760, s.title ?? 'Payment Successful', { size: 60, weight: 700, fill: '#fff', anchor: 'middle' })}
    ${text(W / 2, 920, s.amountText, { size: 120, weight: 700, fill: '#fff', anchor: 'middle' })}
    ${text(W / 2, 1030, s.merchant, { size: 52, weight: 500, fill: '#fff', anchor: 'middle' })}
    <rect x="50" y="1210" width="${W - 100}" height="${120 * s.rows.length + 80}" rx="36" fill="#fff"/>
    ${rows(1300, s.rows)}
    <rect x="80" y="2280" width="${W - 160}" height="140" rx="70" fill="${accent}"/>${text(W / 2, 2370, 'Done', { size: 52, weight: 600, fill: '#fff', anchor: 'middle' })}`,
  );
}

/** Bank app transaction detail screen. */
export function bankTxnDetail(s) {
  // `dark: true` draws the system dark appearance (white on black), as many users run their bank app.
  const fg = s.dark ? '#ffffff' : '#111111';
  const card = s.dark ? '#1c1c1e' : '#ffffff';
  return frame(
    `${statusBar({ dark: s.dark })}${text(80, 270, '‹', { size: 90, fill: '#0a84ff' })}${text(W / 2, 260, 'Transaction details', { size: 50, weight: 600, anchor: 'middle', fill: fg })}
    <circle cx="${W / 2}" cy="480" r="100" fill="${s.logoColor ?? '#ffcc00'}"/>${text(W / 2, 515, s.merchant.charAt(0), { size: 100, weight: 700, anchor: 'middle', fill: '#222' })}
    ${text(W / 2, 680, s.merchant, { size: 58, weight: 600, anchor: 'middle', fill: fg })}
    ${text(W / 2, 830, s.amountText, { size: 110, weight: 700, anchor: 'middle', fill: fg })}
    ${text(W / 2, 920, s.statusText ?? 'Completed', { size: 42, fill: '#34c759', anchor: 'middle' })}
    <rect x="50" y="1010" width="${W - 100}" height="${120 * s.rows.length + 80}" rx="36" fill="${card}"/>
    ${rows(1100, s.rows, { valueFill: fg, divider: s.dark ? '#38383a' : '#e5e5ea' })}
    ${s.footer ? text(W / 2, 2300, s.footer, { size: 38, fill: '#8e8e93', anchor: 'middle' }) : ''}`,
    s.dark ? '#000000' : '#f2f2f7',
  );
}

/** Lock screen with notification cards; one or more may be unrelated noise. */
export function lockScreen(s) {
  let y = 1280;
  const cards = s.notifications
    .map((n) => {
      const bodyLines = wrap(n.body, 38);
      const height = 200 + bodyLines.length * 54;
      const card = `<rect x="40" y="${y}" width="${W - 80}" height="${height}" rx="44" fill="#ffffff" opacity="0.82"/>
      <rect x="80" y="${y + 40}" width="70" height="70" rx="16" fill="${n.color ?? '#0a84ff'}"/>
      ${text(175, y + 90, n.app, { size: 38, weight: 600, fill: '#333' })}${text(W - 80, y + 90, n.time ?? 'now', { size: 36, fill: '#555', anchor: 'end' })}
      ${text(80, y + 160, n.title, { size: 42, weight: 700 })}
      ${bodyLines.map((line, j) => text(80, y + 215 + j * 54, line, { size: 42, fill: '#222' })).join('')}`;
      y += height + 30;
      return card;
    })
    .join('');
  return frame(
    `<defs><linearGradient id="wp" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#3a1c71"/><stop offset="0.5" stop-color="#d76d77"/><stop offset="1" stop-color="#ffaf7b"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#wp)"/>${statusBar({ dark: true })}
    ${text(W / 2, 400, s.dateLine ?? 'Saturday 27 September', { size: 54, weight: 500, fill: '#fff', anchor: 'middle' })}
    ${text(W / 2, 660, s.clock ?? '9:41', { size: 280, weight: 700, fill: '#fff', anchor: 'middle' })}${cards}`,
    '#000',
  );
}

/** Bank transfer receipt. */
export function transferReceipt(s) {
  return frame(
    `${statusBar()}${text(W / 2, 270, s.app ?? 'Lumen Bank', { size: 50, weight: 700, anchor: 'middle', fill: '#c8102e' })}
    <rect x="50" y="340" width="${W - 100}" height="${560 + 120 * s.rows.length}" rx="40" fill="#fff"/>
    ${text(W / 2, 470, s.title ?? 'Transfer Successful', { size: 56, weight: 700, anchor: 'middle', fill: '#1f9d55' })}
    ${text(W / 2, 640, s.amountText, { size: 120, weight: 700, anchor: 'middle' })}
    ${text(W / 2, 740, s.subtitle ?? '', { size: 42, fill: '#6b6b70', anchor: 'middle' })}
    ${rows(880, s.rows)}
    ${text(W / 2, 2350, 'Share receipt', { size: 46, weight: 600, fill: '#c8102e', anchor: 'middle' })}`,
  );
}

/** A list of transactions under an account header (the multi-row case). */
export function txnList(s) {
  const list = s.items
    .map((it, i) => {
      const y = 1080 + i * 190;
      return `<circle cx="150" cy="${y}" r="56" fill="${it.color ?? '#e5e5ea'}"/>${text(150, y + 18, it.name.charAt(0), { size: 52, weight: 700, anchor: 'middle', fill: '#333' })}
      ${text(240, y - 8, it.name, { size: 46, weight: 600 })}${text(240, y + 50, it.sub, { size: 38, fill: '#8e8e93' })}
      ${text(W - 80, y + 14, it.amountText, { size: 46, weight: 600, anchor: 'end', fill: it.amountText.startsWith('+') ? '#1f9d55' : '#111' })}
      <line x1="240" x2="${W - 80}" y1="${y + 90}" y2="${y + 90}" stroke="#e5e5ea" stroke-width="2"/>`;
    })
    .join('');
  return frame(
    `${statusBar()}<rect x="50" y="200" width="${W - 100}" height="560" rx="44" fill="${s.cardColor ?? '#1c3d5a'}"/>
    ${text(110, 320, s.accountTitle, { size: 50, weight: 600, fill: '#fff' })}
    ${text(110, 390, s.accountSub ?? '', { size: 40, fill: '#c9d6e2' })}
    ${text(110, 560, s.balanceLabel ?? 'Available balance', { size: 40, fill: '#c9d6e2' })}
    ${text(110, 670, s.balanceText, { size: 96, weight: 700, fill: '#fff' })}
    ${text(80, 930, s.listTitle ?? 'Recent transactions', { size: 52, weight: 700 })}
    <rect x="50" y="980" width="${W - 100}" height="${190 * s.items.length + 20}" rx="36" fill="#fff"/>${list}`,
  );
}

/** E-commerce order confirmation with a price breakdown. */
export function orderConfirm(s) {
  const itemRows = s.items
    .map((it, i) => {
      const y = 760 + i * 170;
      return `<rect x="90" y="${y - 70}" width="120" height="120" rx="18" fill="#e9e3d8"/>${text(240, y - 10, it.name, { size: 42, weight: 500 })}${text(240, y + 45, `Qty ${it.qty}`, { size: 36, fill: '#8e8e93' })}${text(W - 90, y + 10, it.priceText, { size: 42, weight: 600, anchor: 'end' })}`;
    })
    .join('');
  const breakdownY = 760 + s.items.length * 170 + 60;
  return frame(
    `${statusBar()}${text(W / 2, 260, s.app ?? 'Bazaario', { size: 52, weight: 800, anchor: 'middle', fill: '#ee4d2d' })}
    ${text(80, 420, s.title ?? 'Order placed!', { size: 64, weight: 700 })}${text(80, 500, s.orderNo, { size: 40, fill: '#8e8e93' })}
    <rect x="50" y="560" width="${W - 100}" height="${breakdownY + 40 + s.breakdown.length * 110 - 560}" rx="36" fill="#fff"/>${itemRows}
    ${rows(breakdownY + 40, s.breakdown, { gap: 110 })}
    ${text(80, 2250, 'Payment method', { size: 40, fill: '#6b6b70' })}${text(W - 80, 2250, s.paymentMethod, { size: 40, weight: 600, anchor: 'end' })}`,
  );
}

/** Mail app showing an emailed receipt. */
export function emailReceipt(s) {
  const body = s.lines
    .map((line, i) => {
      const y = 1020 + i * 90;
      if (Array.isArray(line)) {
        return `${text(110, y, line[0], { size: 42, fill: '#333' })}${text(W - 110, y, line[1], { size: 42, weight: line[2] ? 700 : 400, anchor: 'end' })}`;
      }
      return text(110, y, line, { size: 42, fill: '#333' });
    })
    .join('');
  return frame(
    `${statusBar()}${text(70, 260, '‹ Inbox', { size: 46, fill: '#0a84ff' })}
    ${text(80, 400, s.subject, { size: 54, weight: 700 })}
    <circle cx="130" cy="530" r="50" fill="#8e44ad"/>${text(130, 548, s.from.charAt(0), { size: 50, weight: 700, fill: '#fff', anchor: 'middle' })}
    ${text(210, 520, s.from, { size: 44, weight: 600 })}${text(210, 575, `to me · ${s.when}`, { size: 36, fill: '#8e8e93' })}
    <rect x="70" y="700" width="${W - 140}" height="${360 + s.lines.length * 90}" rx="24" fill="#fff" stroke="#e5e5ea" stroke-width="3"/>
    ${text(W / 2, 860, s.brand, { size: 66, weight: 800, anchor: 'middle', fill: '#e50914' })}${body}`,
    '#ffffff',
  );
}

function wrap(str, max) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max) {
      lines.push(cur.trim());
      cur = w;
    } else cur += ` ${w}`;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

export const SCREEN_TEMPLATES = {
  walletPayment,
  bankTxnDetail,
  lockScreen,
  transferReceipt,
  txnList,
  orderConfirm,
  emailReceipt,
};
