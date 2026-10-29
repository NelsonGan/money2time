// The web pages this Worker serves people (the rest of it is JSON for the
// app): the page an invite link opens, and the one a broken invite link gets.
// Styled as money2time.com (brand.ts); one self-contained document each, with
// no script or asset of its own beyond the site's fonts and media bucket.

import {
  APP_STORE_URL,
  DARK,
  escapeHtml,
  FONT_SANS,
  GOOGLE_FONTS_URL,
  ICON_URL,
  LIGHT,
  MASCOT_THINKING_URL,
  MASCOT_URL,
  MEDIA_ORIGIN,
  PLAY_STORE_URL,
  SITE_URL,
} from './brand';

type Palette = typeof LIGHT | typeof DARK;

function vars(p: Palette): string {
  return `--background:${p.background};--card:${p.card};--surface-muted:${p.surfaceMuted};--border:${p.border};--foreground:${p.foreground};--foreground-soft:${p.foregroundSoft};--foreground-muted:${p.foregroundMuted};--primary:${p.primary};--primary-dark:${p.primaryDark};--primary-soft:${p.primarySoft};--primary-muted:${p.primaryMuted};--on-primary:${p.onPrimary};--wm-money:${p.wordmarkMoney};--wm-two:${p.wordmarkTwo};--wm-time:${p.wordmarkTime};`;
}

const STYLE = `
:root{color-scheme:light dark;${vars(LIGHT)}--shadow-soft:0 1px 2px rgba(74,56,40,.04),0 6px 18px rgba(74,56,40,.05);--shadow-float:0 4px 10px rgba(74,56,40,.05),0 18px 46px rgba(74,56,40,.1);--shadow-glow:0 10px 24px rgba(142,66,80,.22),0 20px 44px rgba(142,66,80,.18)}
@media (prefers-color-scheme:dark){:root{${vars(DARK)}--shadow-soft:0 1px 2px rgba(0,0,0,.3);--shadow-float:0 18px 46px rgba(0,0,0,.35);--shadow-glow:0 10px 30px rgba(223,134,147,.18)}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;padding:28px 16px 32px;background:var(--background);color:var(--foreground);font:16px/1.55 ${FONT_SANS};-webkit-font-smoothing:antialiased}
a{color:inherit}
.wordmark{display:inline-flex;align-items:center;gap:.42em;font-size:22px;font-weight:800;letter-spacing:-.04em;line-height:1;text-decoration:none;white-space:nowrap}
.wordmark img{width:1.5em;height:1.5em;border-radius:28%;display:block}
.wm-money{color:var(--wm-money)}.wm-time{color:var(--wm-time)}
.wm-two{color:var(--wm-two);display:inline-block;font-size:.5em;transform:translateY(-.6em)}
main{flex:1;display:flex;flex-direction:column;justify-content:center;width:100%;max-width:420px;padding:16px 0 28px}
.card{position:relative;background:var(--card);border:1px solid var(--border);border-radius:28px;box-shadow:var(--shadow-float);padding:0 24px 28px;text-align:center;margin-top:64px}
.mascot{width:136px;height:136px;margin:-68px auto 8px;border-radius:50%;background:var(--primary-soft);border:6px solid var(--card);display:flex;align-items:center;justify-content:center}
.mascot img{width:116px;height:116px;display:block;margin-top:4px}
.eyebrow{margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--primary)}
h1{margin:0 0 10px;font-size:28px;font-weight:800;letter-spacing:-.03em;line-height:1.14;text-wrap:balance}
.lede{margin:0 auto 24px;max-width:320px;color:var(--foreground-soft);font-size:16px;text-wrap:pretty}
.button{display:block;padding:16px 20px;border-radius:18px;background:var(--primary);color:var(--on-primary);font-size:17px;font-weight:700;letter-spacing:-.01em;text-decoration:none;box-shadow:var(--shadow-glow);transition:transform .2s cubic-bezier(.22,1,.36,1),background-color .2s}
.button:hover{background:var(--primary-dark)}
.button:active{transform:scale(.98)}
.divider{display:flex;align-items:center;gap:12px;margin:26px 0 16px;color:var(--foreground-muted);font-size:13px;font-weight:600}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--border)}
.stores{display:flex;gap:10px}
.store{flex:1;display:flex;align-items:center;justify-content:center;gap:10px;min-width:0;padding:10px 12px;border-radius:14px;background:var(--foreground);color:var(--card);text-decoration:none;transition:transform .2s cubic-bezier(.22,1,.36,1),opacity .2s}
.store:hover{opacity:.9}.store:active{transform:scale(.98)}
.store svg{width:22px;height:22px;flex:none}
.store span{display:flex;flex-direction:column;align-items:flex-start;line-height:1.15;text-align:left}
.store small{font-size:10px;font-weight:500}
.store strong{font-size:16px;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.note{margin:16px 0 0;color:var(--foreground-muted);font-size:13px;line-height:1.5;text-wrap:pretty}
footer{color:var(--foreground-muted);font-size:13px;text-align:center;text-wrap:balance}
footer a{color:var(--foreground-soft);font-weight:600;text-decoration:none}
footer a:hover{color:var(--primary)}
@media (min-width:600px){body{padding-top:40px}.card{padding:0 36px 32px}h1{font-size:30px}}
@media (prefers-reduced-motion:reduce){.button,.store{transition:none}}
`;

const APPLE_GLYPH = `<svg viewBox="0 0 22 26" fill="currentColor" aria-hidden="true"><path d="M16.52 12.76c-.03-3.12 2.55-4.62 2.67-4.7-1.45-2.12-3.72-2.41-4.53-2.45-1.93-.2-3.76 1.14-4.74 1.14-.98 0-2.49-1.11-4.1-1.08-2.11.03-4.05 1.23-5.14 3.12-2.19 3.8-.56 9.43 1.57 12.52 1.04 1.5 2.29 3.2 3.92 3.14 1.57-.06 2.17-1.02 4.07-1.02 1.9 0 2.44 1.02 4.1.99 1.69-.03 2.77-1.53 3.8-3.04 1.2-1.74 1.69-3.43 1.72-3.51-.04-.02-3.3-1.27-3.34-5.01zM13.47 3.53C14.33 2.47 14.93.99 14.77 0c-1.24.05-2.75.82-3.64 1.87-.8.93-1.5 2.41-1.31 3.83 1.38.11 2.79-.7 3.65-2.17z"/></svg>`;

const PLAY_GLYPH = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.292 2.751A2.106 2.106 0 001 3.813v16.374c0 .394.106.762.292 1.062l.058.063L9.9 12.756v-.138L1.35 4.063l-.058-.062z" fill="#4285F4"/><path d="M13.003 15.86l-3.1-3.1v-.138l3.1-3.1.07.04 3.672 2.086c1.049.596 1.049 1.572 0 2.168L13.073 15.8l-.07.06z" fill="#FBBC04"/><path d="M13.073 15.8L9.9 12.627 1.292 21.25c.346.365.916.41 1.56.045l10.221-5.494z" fill="#EA4335"/><path d="M13.073 9.455L2.852 3.958c-.644-.362-1.214-.32-1.56.048L9.9 12.627l3.173-3.172z" fill="#34A853"/></svg>`;

function shell(options: { title: string; body: string; script?: { nonce: string; code: string } }) {
  const { title, body, script } = options;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="${LIGHT.background}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${DARK.background}" media="(prefers-color-scheme: dark)">
<title>${escapeHtml(title)}</title>
<link rel="icon" href="${ICON_URL}">
<link rel="apple-touch-icon" href="${ICON_URL}">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_URL}">
<style>${STYLE}</style>
</head>
<body>
<a class="wordmark" href="${SITE_URL}" aria-label="Money2Time"><img src="${ICON_URL}" alt="" width="33" height="33"><span><span class="wm-money">Money</span><span class="wm-two">2</span><span class="wm-time">Time</span></span></a>
<main>
${body}
</main>
<footer><a href="${SITE_URL}">money2time.com</a> · The expense tracker that shows every purchase in hours of your life</footer>
${script ? `<script nonce="${script.nonce}">${script.code}</script>\n` : ''}</body>
</html>`;
}

function headers(nonce?: string): HeadersInit {
  const scriptSrc = nonce ? `'nonce-${nonce}'` : "'none'";
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': [
      "default-src 'none'",
      "style-src 'unsafe-inline' https://fonts.googleapis.com",
      'font-src https://fonts.gstatic.com',
      `img-src ${MEDIA_ORIGIN}`,
      `script-src ${scriptSrc}`,
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
  };
}

/**
 * The page `GET /join/<code>` answers with. `code` must already be checked
 * (ledgers.ts); it is escaped regardless. Shows nothing about the ledger, so
 * it needs no database read: the app looks the invite up itself.
 */
export function invitePageHtml(
  code: string,
  nonce: string,
): { html: string; headers: HeadersInit } {
  const deepLink = `money2time://join/${encodeURIComponent(code)}`;
  const body = `<section class="card">
  <div class="mascot"><img src="${MASCOT_URL}" alt="" width="116" height="116"></div>
  <p class="eyebrow">Shared ledger</p>
  <h1>You're invited to a shared ledger</h1>
  <p class="lede">Open the invite in Money2Time to see who shared it, then join in one tap. You don't need Pro to join.</p>
  <a class="button" href="${escapeHtml(deepLink)}">Open in Money2Time</a>
  <div class="divider">Don't have the app yet?</div>
  <div class="stores">
    <a class="store" href="${APP_STORE_URL}" rel="noopener noreferrer">${APPLE_GLYPH}<span><small>Download on the</small><strong>App Store</strong></span></a>
    <a class="store" href="${PLAY_STORE_URL}" rel="noopener noreferrer">${PLAY_GLYPH}<span><small>Get it on</small><strong>Google Play</strong></span></a>
  </div>
  <p class="note">Once it's installed, come back and tap the invite link again. The link works for a day.</p>
</section>`;
  // Tries the app straight away; nothing happens where it is not installed.
  const redirect = `setTimeout(function(){location.href=${JSON.stringify(deepLink).replace(/</g, '\\u003c')}},300);`;
  return {
    html: shell({
      title: 'Join a shared ledger · Money2Time',
      body,
      script: { nonce, code: redirect },
    }),
    headers: headers(nonce),
  };
}

/** A `/join/…` link whose code cannot be one: mistyped or cut short. */
export function brokenInvitePageHtml(): { html: string; headers: HeadersInit } {
  const body = `<section class="card">
  <div class="mascot"><img src="${MASCOT_THINKING_URL}" alt="" width="116" height="116"></div>
  <p class="eyebrow">Shared ledger</p>
  <h1>This invite link doesn't look right</h1>
  <p class="lede">It may have been cut short when it was copied. Ask the person who shared it to send the link again.</p>
  <a class="button" href="${SITE_URL}">Go to money2time.com</a>
</section>`;
  return { html: shell({ title: 'Invite link not found · Money2Time', body }), headers: headers() };
}
