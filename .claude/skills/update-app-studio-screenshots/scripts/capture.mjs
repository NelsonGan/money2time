#!/usr/bin/env node
// Captures App Studio's store screens from the app running the
// `app-studio-seed-data` branch. It talks to the app through Metro's debugger
// (Runtime.evaluate), seeds each locale with `globalThis.__appStudio`, walks
// the React fiber tree to move between screens, and saves each screen with
// the leased device's `agent-device screenshot`.
//
//   node capture.mjs --device iphone --port 8082 --agent-device <path> run en zh ms ...
//   node capture.mjs --device ipad   --port 8082 --agent-device <path> run all
//   node capture.mjs --port 8082 eval '__cap.where()'
//
// Flags:
//   --device iphone|duo|ipad   which screen set (pixel density and output folder)
//   --port <n>                 the Metro port simlock-metro printed
//   --agent-device <path>      the command device_open returned (for screenshots)
//   --target <text>            pick the debugger target whose deviceName contains
//                              this, when two devices share one Metro
//   --out <dir>                where shots go (default ./shots/<device>/<locale>)
//   --only <names>             comma-separated screen names to capture, e.g. 01-home
//   --udid <UDID>              capture with `simctl io screenshot` on this Simlock
//                              simulator instead (the iPhone Duo; simlock-udid)
//   --display <n>              the simctl display with --udid (default 3, the
//                              Duo's inner display)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LOCALES = [
  'en', 'zh', 'ms', 'da', 'de', 'es', 'fil', 'fr', 'hi', 'id', 'it', 'ja',
  'ko', 'nb', 'nl', 'pl', 'pt', 'ru', 'sv', 'th', 'tr', 'uk', 'vi',
];

// Pixel density per device: the iPhone 18 Pro and the iPhone Duo are 3x, the
// iPad Pro 13-inch is 2x. These give the native capture sizes App Studio uses.
const DENSITY = { iphone: 3, duo: 3, ipad: 2 };

// Short note typed on the create-transaction shot.
const NOTE = {
  en: 'Dinner with friends', zh: '和朋友吃饭', ms: 'Makan malam dengan kawan', da: 'Middag med venner',
  de: 'Abendessen mit Freunden', es: 'Cena con amigos', fil: 'Hapunan kasama barkada',
  fr: 'Dîner entre amis', hi: 'दोस्तों के साथ डिनर', id: 'Makan malam bareng teman',
  it: 'Cena con gli amici', ja: '友達とディナー', ko: '친구들과 저녁', nb: 'Middag med venner',
  nl: 'Etentje met vrienden', pl: 'Kolacja ze znajomymi', pt: 'Jantar com amigos',
  ru: 'Ужин с друзьями', sv: 'Middag med vänner', th: 'กินข้าวกับเพื่อน', tr: 'Arkadaşlarla akşam yemeği',
  uk: 'Вечеря з друзями', vi: 'Ăn tối với bạn bè',
};

// Dinner total typed on the create-transaction shot, then split three ways.
const AMOUNT = {
  en: '90', zh: '90', ms: '90', da: '450', de: '60', es: '60', fil: '1500',
  fr: '60', hi: '1500', id: '300000', it: '60', ja: '6000', ko: '60000', nb: '600', nl: '60',
  pl: '150', pt: '150', ru: '3000', sv: '450', th: '900', tr: '1500', uk: '900', vi: '600000',
};

function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[(i += 1)];
    else rest.push(argv[i]);
  }
  return { flags, rest };
}

const { flags, rest } = parseArgs(process.argv.slice(2));
const PORT = flags.port ?? '8081';
const DEVICE = flags.device ?? 'iphone';
const AGENT_DEVICE = flags['agent-device'];
const OUT = resolve(flags.out ?? join('shots', DEVICE));
const ONLY = flags.only ? new Set(flags.only.split(',')) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIMLOCK_SET = join(process.env.HOME, '.simlock/devices/ios');

async function connect() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const candidates = targets.filter(
    (t) => (t.description ?? '').includes('Bridgeless') && (!flags.target || (t.deviceName ?? '').includes(flags.target)),
  );
  if (candidates.length !== 1) {
    throw new Error(
      `expected one app debugger target on Metro ${PORT}, found ${candidates.length}: ` +
        targets.map((t) => `${t.deviceName} / ${t.description}`).join('; ') +
        ' (pass --target <part of deviceName>)',
    );
  }
  // Metro refuses an inspector socket without an Origin header.
  const ws = new WebSocket(candidates[0].webSocketDebuggerUrl, {
    headers: { Origin: `http://127.0.0.1:${PORT}` },
  });
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = (e) => rej(new Error(`debugger socket: ${e.message ?? e.type}`));
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  const evaluate = async (expression) => {
    id += 1;
    const msgId = id;
    const msg = await new Promise((res, rej) => {
      const timer = setTimeout(() => rej(new Error(`evaluate timed out: ${expression.slice(0, 80)}`)), 20000);
      pending.set(msgId, (reply) => {
        clearTimeout(timer);
        res(reply);
      });
      ws.send(JSON.stringify({ id: msgId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(msg.result.exceptionDetails.exception?.description ?? JSON.stringify(msg.result.exceptionDetails));
    }
    return msg.result?.result?.value;
  };
  return { ws, evaluate };
}

// Helpers installed into the app runtime. Screens are reached through the
// React fiber tree (props such as onTabChange and onSelectDay), so the app
// needs no test hooks beyond the seed branch's __appStudio.
const HELPERS = String.raw`
globalThis.__cap = (() => {
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const roots = () => {
    const out = [];
    hook.renderers.forEach((_, id) => hook.getFiberRoots(id).forEach((r) => out.push(r.current)));
    return out;
  };
  const find = (pred, all, from) => {
    const hits = [];
    const stack = from ? [from.child].filter(Boolean) : roots().slice();
    while (stack.length) {
      const f = stack.pop();
      try { if (pred(f)) { if (!all) return f; hits.push(f); } } catch (e) {}
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    return all ? hits : null;
  };
  const props = (f) => (f && f.memoizedProps) || {};
  const textOf = (f) => {
    const c = props(f).children;
    return typeof c === 'string' ? c : Array.isArray(c) && c.every((x) => typeof x === 'string' || typeof x === 'number') ? c.join('') : null;
  };
  const pressUp = (f) => {
    for (let n = f; n; n = n.return) {
      if (typeof props(n).onPress === 'function') { props(n).onPress({ nativeEvent: {} }); return true; }
    }
    return false;
  };
  const ctx = (key) => {
    const f = find((x) => x.memoizedProps && x.memoizedProps.value && typeof x.memoizedProps.value[key] !== 'undefined');
    return f && f.memoizedProps.value;
  };
  const owner = (f) => {
    for (let n = f; n; n = n.return) {
      const q = n.memoizedProps;
      if (q && q.route && q.route.name && q.navigation) return q.route.name;
    }
    return null;
  };
  const nav = (routeName) => {
    const f = find((x) => {
      const n = props(x).navigation;
      return n && typeof n.getState === 'function' && n.getState().routeNames && n.getState().routeNames.includes(routeName);
    });
    return f && props(f).navigation;
  };
  const rootNav = () => nav('AddTransactionDetailed');
  const isNumpadKey = (x) => x.type && /^NumpadKey/.test(x.type.name || x.type.displayName || '');
  return {
    find, props, ctx, owner, nav,
    where: () => { const n = rootNav(); const s = n && n.getState(); return s ? s.routes.map((r) => r.name) : null; },
    pro: () => { const v = ctx('setDevProOverride'); v.setDevProOverride(true); return true; },
    tab: (name) => { const f = find((x) => typeof props(x).onTabChange === 'function' && props(x).activeTab); if (!f) return false; props(f).onTabChange(name); return true; },
    insight: (type) => {
      const f = find((x) => Array.isArray(props(x).options) && props(x).options.some((o) => o && o.value === 'budget') && typeof props(x).onSelect === 'function');
      if (!f) return false;
      props(f).onSelect(type); return true;
    },
    settings: (handler) => { const f = find((x) => typeof props(x)[handler] === 'function' && typeof props(x).onOpenRecurring === 'function'); if (!f) return false; props(f)[handler](); return true; },
    settingsHome: () => { const n = nav('SettingsHome'); if (n && n.getState().index > 0) n.popToTop(); return !!n; },
    navigate: (route) => { const n = nav(route); n.navigate(route); return true; },
    back: (route) => { const n = nav(route); if (n && n.canGoBack()) n.goBack(); return true; },
    resetRoot: () => { const n = rootNav(); if (n && n.getState().index > 0) n.popToTop(); return true; },
    // Matches are filtered to the given route (by walking up to the nearest
    // screen), since sheets and portals render outside the screen's subtree.
    pressLabel: (route, label) => {
      const hits = find((x) => props(x).accessibilityLabel === label && owner(x) === route, true);
      const f = hits[hits.length - 1];
      return f ? pressUp(f) : false;
    },
    pressText: (route, text) => {
      const hits = find((x) => typeof x.type === 'string' && textOf(x) === text && owner(x) === route, true);
      const f = hits[hits.length - 1];
      return f ? pressUp(f) : false;
    },
    key: (route, value) => {
      const hits = find((x) => props(x).value === value && typeof props(x).onPress === 'function' && isNumpadKey(x) && owner(x) === route, true);
      const f = hits[hits.length - 1];
      if (!f) return false; props(f).onPress(value); return hits.length;
    },
    type: (route, placeholder, text) => {
      const hits = find((x) => props(x).placeholder === placeholder && typeof props(x).onChangeText === 'function' && !props(x).value && owner(x) === route, true);
      const f = hits[0];
      if (!f) return false; props(f).onChangeText(text); return true;
    },
    dismissLogs: () => {
      const hits = find((x) => typeof props(x).onPressDismiss === 'function', true);
      hits.forEach((f) => props(f).onPressDismiss());
      return hits.length;
    },
    homeList: () => {
      const f = find((x) => typeof props(x).onSelectDay === 'function');
      if (!f) return false;
      const now = new Date();
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const key = last.getFullYear() + '-' + String(last.getMonth() + 1).padStart(2, '0') + '-' + String(last.getDate()).padStart(2, '0');
      props(f).onSelectDay(key);
      return key;
    },
  };
})();
true;
`;

// Dark pixels in the strip between the clock and the status icons. The
// simulator sometimes draws the Dynamic Island's black pill into a capture;
// on a clean iPhone shot this strip is the page background.
function islandPixels(file) {
  const raw = execFileSync('ffmpeg', [
    '-loglevel', 'error', '-i', file, '-vf', 'crop=120:40:543:60,format=gray', '-f', 'rawvideo', '-',
  ]);
  let dark = 0;
  for (const value of raw) if (value < 40) dark += 1;
  return dark;
}

// The status bar is pinned once per lease (SKILL.md, `simctl status_bar
// override`), so captures are taken as they are.
async function shot(locale, name) {
  const dir = join(OUT, locale);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.png`);
  for (let attempt = 1; ; attempt += 1) {
    if (flags.udid) {
      // agent-device cannot capture a Simlock iPhone Duo (CoreDevice does not
      // see simulators in Simlock's device set), so take the lit inner display
      // with simctl.
      execFileSync('xcrun', [
        'simctl', '--set', SIMLOCK_SET, 'io', flags.udid, 'screenshot', `--display=${flags.display ?? '3'}`, file,
      ], { stdio: 'ignore', timeout: 60000 });
    } else {
      execFileSync(AGENT_DEVICE, ['screenshot', file, '--pixel-density', String(DENSITY[DEVICE])], {
        stdio: 'ignore',
        timeout: 60000,
      });
    }
    if (DEVICE !== 'iphone' || islandPixels(file) < 200) return file;
    if (attempt === 4) throw new Error(`${locale}/${name}: the Dynamic Island pill is in every capture`);
    await sleep(1500);
  }
}

async function captureLocale(evaluate, locale) {
  const call = (js) => evaluate(`__cap.${js}`);
  const step = async (label, js, wait = 900) => {
    const result = await call(js);
    if (result === false || result == null) throw new Error(`${locale}: ${label} failed (${js})`);
    await sleep(wait);
    return result;
  };
  const take = async (name) => {
    if (ONLY && !ONLY.has(name)) return;
    await call('dismissLogs()');
    await sleep(400);
    await shot(locale, name);
  };
  const t = async (key) => evaluate(`__appStudio.t(${JSON.stringify(key)}, ${JSON.stringify(locale)})`);

  await evaluate(HELPERS);
  await step('reset root', 'resetRoot()', 1200);
  await call(`tab('calendar')`);
  await sleep(600);
  if ((await evaluate('typeof globalThis.__appStudio')) !== 'object') {
    throw new Error('globalThis.__appStudio is missing: is the app running the app-studio-seed-data branch?');
  }
  await evaluate(`__appStudio.seed(${JSON.stringify(locale)})`);
  let status = null;
  for (let i = 0; i < 120 && !status; i += 1) {
    await sleep(250);
    status = await evaluate('__appStudio.seedStatus');
  }
  if (!status || status.startsWith('error')) throw new Error(`${locale}: seed ${status ?? 'timed out'}`);
  await sleep(2500);
  await evaluate(HELPERS); // the locale switch can remount providers
  const info = await evaluate(`__appStudio.info(${JSON.stringify(locale)})`);

  await step('pro', 'pro()', 500);
  await step('tab calendar', `tab('calendar')`, 1200);
  await step('home list', 'homeList()', 2000);
  await take('01-home');

  await step('tab accounts', `tab('accounts')`, 1500);
  await take('02-accounts');

  await step('tab insights', `tab('insights')`, 1200);
  await step('breakdown', `insight('expense_breakdown')`, 1800);
  await take('03-expense-breakdown');
  await step('budget', `insight('budget')`, 1800);
  await take('08-budgeting');

  await step('tab settings', `tab('settings')`, 1000);
  await step('settings home', 'settingsHome()', 800);
  await step('recurring', `settings('onOpenRecurring')`, 1800);
  await take('04-subscription-recurring');
  await step('settings home', 'settingsHome()', 900);
  await step('hourly', `settings('onOpenHourlyValue')`, 1800);
  await take('06-hourly-wage');
  await step('settings home', 'settingsHome()', 900);
  // Opening the editor straight after popping Settings can leave the native
  // stack without the new screen, so settle on Home first.
  await step('tab calendar', `tab('calendar')`, 1500);

  const R = 'AddTransactionDetailed';
  await step('editor', `navigate('${R}')`, 1800);
  await step('food', `pressText('${R}', ${JSON.stringify(info.food)})`, 800);
  await step('dining', `pressText('${R}', ${JSON.stringify(info.dining)})`, 1000);
  for (const digit of AMOUNT[locale]) await step(`key ${digit}`, `key('${R}', ${JSON.stringify(digit)})`, 200);
  await sleep(300);
  await step('note', `type('${R}', ${JSON.stringify(await t('transactions.editor.optional'))}, ${JSON.stringify(NOTE[locale])})`, 1200);
  await take('07-create-transaction');

  await step('split', `pressLabel('${R}', ${JSON.stringify(await t('transactions.editor.split.button_label'))})`, 1800);
  await step('add person', `pressText('SplitBill', ${JSON.stringify(await t('transactions.editor.split.add_person'))})`, 800);
  const placeholder = JSON.stringify(await t('transactions.editor.split.person_placeholder'));
  await step('name 1', `type('SplitBill', ${placeholder}, ${JSON.stringify(info.people[0])})`, 700);
  await step('name 2', `type('SplitBill', ${placeholder}, ${JSON.stringify(info.people[1])})`, 1200);
  await take('05-split-bill');

  await step('back split', `back('SplitBill')`, 1200);
  await step('back editor', `back('${R}')`, 1500);
  await step('tab calendar', `tab('calendar')`, 800);
}

// Relaunch the app on its Metro, after a locale fails part-way.
async function relaunch() {
  execFileSync(AGENT_DEVICE, ['open', 'com.nelsongan.money2time', '--relaunch', '--metro-port', PORT], {
    stdio: 'ignore',
    timeout: 120000,
  });
  await sleep(15000);
}

const [mode, ...args] = rest;
let session = await connect();
try {
  if (mode === 'eval') {
    await session.evaluate(HELPERS);
    console.log(JSON.stringify(await session.evaluate(args.join(' ')), null, 1));
  } else if (mode === 'run') {
    if (!AGENT_DEVICE) throw new Error('--agent-device <path> is required to take screenshots');
    if (!DENSITY[DEVICE]) throw new Error(`--device must be one of ${Object.keys(DENSITY).join(', ')}`);
    const locales = args.length === 0 || args[0] === 'all' ? LOCALES : args;
    for (const locale of locales) {
      for (let attempt = 1; ; attempt += 1) {
        const started = Date.now();
        try {
          await captureLocale(session.evaluate, locale);
          console.log(`${locale} done in ${Math.round((Date.now() - started) / 1000)}s -> ${join(OUT, locale)}`);
          break;
        } catch (error) {
          console.log(`${locale} attempt ${attempt} failed: ${error.message}`);
          if (attempt === 3) throw error;
          session.ws.close();
          await relaunch();
          session = await connect();
        }
      }
    }
  } else {
    console.log('usage: node capture.mjs [flags] run <locale...|all> | eval <js>');
  }
} finally {
  session.ws.close();
}
