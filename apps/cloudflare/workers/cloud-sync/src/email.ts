// The sign-in code email, in Money2Time's look (brand.ts: money2time.com's
// colours, DM Sans, the icon and the three-colour wordmark).
//
// Built for mail clients rather than browsers, after RiceCal's auth emails:
// - Tables, not flex or grid: Outlook renders with Word's engine.
// - Every colour is inline, and again in a prefers-color-scheme block. A
//   client that drops <style> still gets the light palette from the
//   attributes; one that keeps it gets dark mode. Style-block-only colours
//   turn into black on black in Outlook.
// - DM Sans is linked from Google Fonts, which Apple Mail honours and Gmail
//   ignores, so every family carries the system fallback and the mail is
//   designed to be right in that fallback.
// - The icon is a remote image on the site's media bucket with an empty alt:
//   a client that blocks images shows nothing there, and the wordmark under
//   it reads on its own. (A data: URI would be blocked by Gmail outright.)
// - The code comes first, big, in its own cell, selectable and in the subject,
//   so it can be read from the notification without opening the mail.
// - No link to act on: security scanners that open links cannot spend a code.

import {
  DARK,
  escapeHtml,
  FONT_SANS,
  GOOGLE_FONTS_URL,
  ICON_URL,
  LIGHT,
  SITE_URL,
  SUPPORT_EMAIL,
} from './brand';

export interface Email {
  subject: string;
  text: string;
  html: string;
}

/** The email carrying a sign-in code that expires in `minutes`. */
export function signInCodeEmail(code: string, minutes: number): Email {
  const subject = `${code} is your Money2Time code`;
  const expiry = `It expires in ${minutes} minutes and works once.`;
  const preheader = `Enter it in the app to sign in. ${expiry}`;
  const text = [
    `Your Money2Time sign-in code is ${code}.`,
    '',
    `Enter it in the app to sign in to Cloud Sync. ${expiry}`,
    '',
    `Didn't ask for it? You can ignore this email: nobody can sign in without the code. Questions: ${SUPPORT_EMAIL}`,
    '',
    `Money2Time · ${SITE_URL}`,
  ].join('\n');
  return { subject, text, html: layout({ subject, preheader, code: escapeHtml(code), expiry }) };
}

const L = LIGHT;
const D = DARK;

function layout(m: { subject: string; preheader: string; code: string; expiry: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(m.subject)}</title>
<style>
@import url('${GOOGLE_FONTS_URL}');
:root { color-scheme: light dark; supported-color-schemes: light dark; }
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
.m2t-codecell { -webkit-user-select: all; user-select: all; }
@media (prefers-color-scheme: dark) {
  .m2t-body { background-color: ${D.background} !important; }
  .m2t-card { background-color: ${D.card} !important; border-color: ${D.border} !important; }
  .m2t-fg { color: ${D.foreground} !important; }
  .m2t-soft { color: ${D.foregroundSoft} !important; }
  .m2t-muted { color: ${D.foregroundMuted} !important; }
  .m2t-rule { border-color: ${D.border} !important; }
  .m2t-code { background-color: ${D.primarySoft} !important; border-color: ${D.primaryMuted} !important; color: ${D.primary} !important; }
  .m2t-link, .m2t-eyebrow { color: ${D.primary} !important; }
  .m2t-wm-money { color: ${D.wordmarkMoney} !important; }
  .m2t-wm-two { color: ${D.wordmarkTwo} !important; }
  .m2t-wm-time { color: ${D.wordmarkTime} !important; }
}
@media only screen and (max-width: 600px) {
  .m2t-pad { padding-left: 24px !important; padding-right: 24px !important; }
  .m2t-code { font-size: 34px !important; letter-spacing: 8px !important; }
}
</style>
</head>
<body class="m2t-body" style="margin:0;padding:0;width:100%;background-color:${L.background};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(m.preheader)}${'&#8203;&#847;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="m2t-body" style="background-color:${L.background};">
<tr><td align="center" style="padding:36px 12px 48px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto;">

<tr><td align="center" style="padding:0 0 22px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding:0 10px 0 0;vertical-align:middle;"><img src="${ICON_URL}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border:0;border-radius:11px;"></td>
<td style="vertical-align:middle;font-family:${FONT_SANS};font-size:26px;line-height:30px;font-weight:800;letter-spacing:-1px;white-space:nowrap;"><span class="m2t-wm-money" style="color:${L.wordmarkMoney};">Money</span><span class="m2t-wm-two" style="color:${L.wordmarkTwo};font-size:13px;line-height:13px;vertical-align:10px;">2</span><span class="m2t-wm-time" style="color:${L.wordmarkTime};">Time</span></td>
</tr></table>
</td></tr>

<tr><td class="m2t-card" style="background-color:${L.card};border:1px solid ${L.border};border-radius:28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="m2t-pad" style="padding:36px 40px 34px 40px;font-family:${FONT_SANS};">

<p class="m2t-eyebrow" style="margin:0 0 10px 0;font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;color:${L.primary};">Cloud Sync</p>
<h1 class="m2t-fg" style="margin:0 0 10px 0;font-family:${FONT_SANS};font-size:28px;line-height:33px;font-weight:800;letter-spacing:-0.8px;color:${L.foreground};">Your sign-in code</h1>
<p class="m2t-soft" style="margin:0 0 26px 0;font-size:16px;line-height:25px;color:${L.foregroundSoft};">Enter this code in Money2Time to sign in.</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" class="m2t-code m2t-codecell" style="padding:20px 12px;background-color:${L.primarySoft};border:1px solid ${L.primaryMuted};border-radius:20px;font-family:${FONT_SANS};font-size:40px;line-height:46px;font-weight:800;letter-spacing:10px;font-variant-numeric:tabular-nums;color:${L.primaryDark};">${m.code}</td>
</tr></table>

<p class="m2t-muted" style="margin:18px 0 0 0;font-size:14px;line-height:21px;font-weight:500;color:${L.foregroundMuted};text-align:center;">${escapeHtml(m.expiry)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;"><tr>
<td class="m2t-rule" style="padding:0;border-top:1px solid ${L.border};font-size:0;line-height:0;">&nbsp;</td>
</tr></table>

<p class="m2t-soft" style="margin:22px 0 0 0;font-size:14px;line-height:22px;color:${L.foregroundSoft};">Didn't ask for a code? You can ignore this email. Nobody can sign in to your account without it.</p>

</td></tr></table>
</td></tr>

<tr><td class="m2t-pad" align="center" style="padding:24px 40px 0 40px;font-family:${FONT_SANS};">
<p class="m2t-muted" style="margin:0;font-size:13px;line-height:20px;color:${L.foregroundMuted};text-wrap:balance;">Money2Time shows every purchase in hours of your life.<br>Questions? Write to <a class="m2t-link" href="mailto:${SUPPORT_EMAIL}" style="color:${L.primary};text-decoration:underline;">${SUPPORT_EMAIL}</a>.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
