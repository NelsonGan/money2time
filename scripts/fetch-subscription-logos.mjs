// Downloads subscription-service logos from Brandfetch into
// assets/subscription-logos/<country>/<slug>.png, mirroring the layout of
// assets/account-logos (one folder per country plus a "global" folder for the
// services people subscribe to everywhere).
//
// The catalog below is the research output: for each market, the subscription
// services that actually show up on people's cards (streaming video, music,
// cloud storage, telco/ISP bundles, delivery memberships, news, fitness,
// software). Local players are listed per country; anything sold worldwide
// lives in "global" so it is not duplicated 27 times.
//
// Requires BRANDFETCH_API_KEY in the environment (see .env / .env.example).
// Usage:
//   BRANDFETCH_API_KEY=... node scripts/fetch-subscription-logos.mjs
//   BRANDFETCH_API_KEY=... node scripts/fetch-subscription-logos.mjs japan korea
//
// Assets are written as 256x256 PNGs to match assets/account-logos. Brandfetch
// serves the square app-icon variant at that size directly from the CDN, so no
// local image processing is needed; run scripts/normalize-subscription-logos.py
// afterwards if a source only had a non-square or oversized mark.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = process.env.BRANDFETCH_API_KEY;
if (!KEY) {
  console.error('Set BRANDFETCH_API_KEY (see .env.example).');
  process.exit(1);
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO_ROOT, 'assets/subscription-logos');
const SIZE = 256;

// country slug -> { slug: domain }. Country slugs match assets/account-logos.
export const SUBSCRIPTIONS = {
  global: {
    netflix: 'netflix.com',
    'youtube-premium': 'youtube.com',
    spotify: 'spotify.com',
    'disney-plus': 'disneyplus.com',
    'amazon-prime-video': 'primevideo.com',
    'hbo-max': 'max.com',
    'apple-tv-plus': 'tv.apple.com',
    'apple-music': 'music.apple.com',
    icloud: 'icloud.com',
    'apple-arcade': 'apple.com',
    'google-one': 'one.google.com',
    'youtube-music': 'music.youtube.com',
    'microsoft-365': 'microsoft.com',
    onedrive: 'onedrive.com',
    dropbox: 'dropbox.com',
    'adobe-creative-cloud': 'adobe.com',
    canva: 'canva.com',
    figma: 'figma.com',
    notion: 'notion.so',
    chatgpt: 'openai.com',
    claude: 'claude.ai',
    perplexity: 'perplexity.ai',
    midjourney: 'midjourney.com',
    github: 'github.com',
    slack: 'slack.com',
    zoom: 'zoom.us',
    'xbox-game-pass': 'xbox.com',
    'playstation-plus': 'playstation.com',
    'nintendo-switch-online': 'nintendo.com',
    crunchyroll: 'crunchyroll.com',
    twitch: 'twitch.tv',
    'discord-nitro': 'discord.com',
    'telegram-premium': 'telegram.org',
    'linkedin-premium': 'linkedin.com',
    'x-premium': 'x.com',
    patreon: 'patreon.com',
    substack: 'substack.com',
    medium: 'medium.com',
    audible: 'audible.com',
    duolingo: 'duolingo.com',
    coursera: 'coursera.org',
    udemy: 'udemy.com',
    skillshare: 'skillshare.com',
    masterclass: 'masterclass.com',
    grammarly: 'grammarly.com',
    deezer: 'deezer.com',
    tidal: 'tidal.com',
    soundcloud: 'soundcloud.com',
    dazn: 'dazn.com',
    mubi: 'mubi.com',
    strava: 'strava.com',
    myfitnesspal: 'myfitnesspal.com',
    headspace: 'headspace.com',
    calm: 'calm.com',
    peloton: 'onepeloton.com',
    nordvpn: 'nordvpn.com',
    expressvpn: 'expressvpn.com',
    surfshark: 'surfshark.com',
    proton: 'proton.me',
    '1password': '1password.com',
    bitwarden: 'bitwarden.com',
    'chess-com': 'chess.com',
    tinder: 'tinder.com',
    bumble: 'bumble.com',
    viu: 'viu.com',
    wetv: 'wetv.vip',
    'iqiyi-international': 'iq.com',
  },
  'united-states': {
    hulu: 'hulu.com',
    peacock: 'peacocktv.com',
    'paramount-plus': 'paramountplus.com',
    'espn-plus': 'espn.com',
    'youtube-tv': 'tv.youtube.com',
    sling: 'sling.com',
    fubo: 'fubo.tv',
    'discovery-plus': 'discoveryplus.com',
    'amc-plus': 'amcplus.com',
    starz: 'starz.com',
    siriusxm: 'siriusxm.com',
    pandora: 'pandora.com',
    'walmart-plus': 'walmart.com',
    'doordash-dashpass': 'doordash.com',
    'instacart-plus': 'instacart.com',
    'new-york-times': 'nytimes.com',
    'wall-street-journal': 'wsj.com',
    'washington-post': 'washingtonpost.com',
    hellofresh: 'hellofresh.com',
    'planet-fitness': 'planetfitness.com',
    'ring-protect': 'ring.com',
    xfinity: 'xfinity.com',
  },
  china: {
    iqiyi: 'iqiyi.com',
    'tencent-video': 'v.qq.com',
    youku: 'youku.com',
    bilibili: 'bilibili.com',
    'mango-tv': 'mgtv.com',
    'qq-music': 'y.qq.com',
    'netease-cloud-music': 'music.163.com',
    kugou: 'kugou.com',
    ximalaya: 'ximalaya.com',
    'wps-office': 'wps.cn',
    'baidu-netdisk': 'pan.baidu.com',
    'jd-plus': 'jd.com',
    'taobao-88vip': 'taobao.com',
    meituan: 'meituan.com',
    zhihu: 'zhihu.com',
    keep: 'keep.com',
  },
  japan: {
    'u-next': 'unext.jp',
    'hulu-japan': 'hulu.jp',
    lemino: 'lemino.docomo.ne.jp',
    abema: 'abema.tv',
    niconico: 'nicovideo.jp',
    'rakuten-tv': 'tv.rakuten.co.jp',
    dmm: 'dmm.com',
    wowow: 'wowow.co.jp',
    'd-anime-store': 'animestore.docomo.ne.jp',
    'line-music': 'music.line.me',
    awa: 'awa.fm',
    'amazon-japan': 'amazon.co.jp',
  },
  'south-korea': {
    'coupang-play': 'coupangplay.com',
    wavve: 'wavve.com',
    tving: 'tving.com',
    watcha: 'watcha.com',
    melon: 'melon.com',
    genie: 'genie.co.kr',
    flo: 'music-flo.com',
    bugs: 'bugs.co.kr',
    'naver-plus': 'naver.com',
    'kakao-page': 'page.kakao.com',
    ridibooks: 'ridibooks.com',
    millie: 'millie.co.kr',
  },
  taiwan: {
    kkbox: 'kkbox.com',
    kktv: 'kktv.me',
    'friday-video': 'video.friday.tw',
    'hami-video': 'hamivideo.hinet.net',
    myvideo: 'myvideo.net.tw',
    catchplay: 'catchplay.com',
    vidol: 'vidol.tv',
    litv: 'litv.tv',
    'bahamut-anime': 'ani.gamer.com.tw',
    'line-tv': 'linetv.tw',
  },
  singapore: {
    mewatch: 'mewatch.sg',
    'starhub-tv-plus': 'starhub.com',
    'singtel-cast': 'singtel.com',
    'grab-unlimited': 'grab.com',
    'foodpanda-pro': 'foodpanda.com',
    'deliveroo-plus': 'deliveroo.com',
    'straits-times': 'straitstimes.com',
    classpass: 'classpass.com',
  },
  malaysia: {
    astro: 'astro.com.my',
    sooka: 'sooka.my',
    'unifi-tv': 'unifi.com.my',
    tonton: 'tonton.com.my',
    'grab-unlimited': 'grab.com',
    'foodpanda-pro': 'foodpanda.com',
    'shopee-video': 'shopee.com.my',
  },
  indonesia: {
    vidio: 'vidio.com',
    'rcti-plus': 'rctiplus.com',
    maxstream: 'maxstream.tv',
    'mola-tv': 'mola.tv',
    joox: 'joox.com',
    'gojek-plus': 'gojek.com',
    indihome: 'indihome.co.id',
    'catchplay-indonesia': 'catchplay.com',
  },
  thailand: {
    trueid: 'trueid.net',
    'ais-play': 'ais.th',
    monomax: 'monomax.me',
    joox: 'joox.com',
    'oned-3plus': 'ch3plus.com',
    'true-visions': 'truevisions.tv',
  },
  vietnam: {
    'fpt-play': 'fptplay.vn',
    vieon: 'vieon.vn',
    'galaxy-play': 'galaxyplay.vn',
    'k-plus': 'kplus.vn',
    'vtvcab-on': 'vtvcab.vn',
    'zing-mp3': 'zingmp3.vn',
    nhaccuatui: 'nhaccuatui.com',
    mytv: 'mytv.vn',
  },
  philippines: {
    iwanttfc: 'iwanttfc.com',
    vivamax: 'vivamax.net',
    'cignal-play': 'cignal.tv',
    'gma-network': 'gmanetwork.com',
    'globe-gcash': 'gcash.com',
    'smart-giga': 'smart.com.ph',
  },
  india: {
    jiohotstar: 'hotstar.com',
    zee5: 'zee5.com',
    sonyliv: 'sonyliv.com',
    jiocinema: 'jiocinema.com',
    aha: 'aha.video',
    'sun-nxt': 'sunnxt.com',
    'mx-player': 'mxplayer.in',
    jiosaavn: 'jiosaavn.com',
    gaana: 'gaana.com',
    'wynk-music': 'wynk.in',
    'airtel-xstream': 'airtel.in',
    'cult-fit': 'cult.fit',
    'swiggy-one': 'swiggy.com',
    'zomato-gold': 'zomato.com',
    'times-prime': 'timesprime.com',
  },
  brazil: {
    globoplay: 'globoplay.globo.com',
    telecine: 'telecineplay.com.br',
    premiere: 'premiere.globo.com',
    'claro-tv-plus': 'claro.com.br',
    'vivo-play': 'vivo.com.br',
    looke: 'looke.com.br',
    'ifood-clube': 'ifood.com.br',
    'rappi-prime': 'rappi.com.br',
    'meli-plus': 'mercadolivre.com.br',
  },
  mexico: {
    vix: 'vix.com',
    'blim-tv': 'blimtv.tv',
    'claro-video': 'clarovideo.com',
    izzi: 'izzi.mx',
    'sky-mexico': 'sky.com.mx',
    'cinepolis-klic': 'cinepolisklic.com',
    'rappi-prime': 'rappi.com',
    'meli-plus': 'mercadolibre.com.mx',
    totalplay: 'totalplay.com.mx',
  },
  spain: {
    'movistar-plus': 'movistarplus.es',
    filmin: 'filmin.es',
    atresplayer: 'atresplayer.com',
    'rtve-play': 'rtve.es',
    mitele: 'mitele.es',
    'orange-tv': 'orange.es',
    'rakuten-tv': 'rakuten.tv',
    flixole: 'flixole.com',
  },
  portugal: {
    meo: 'meo.pt',
    nos: 'nos.pt',
    'vodafone-tv': 'vodafone.pt',
    opto: 'opto.sic.pt',
    'rtp-play': 'rtp.pt',
    'filmin-portugal': 'filmin.pt',
  },
  france: {
    'canal-plus': 'canalplus.com',
    molotov: 'molotov.tv',
    'france-tv': 'france.tv',
    arte: 'arte.tv',
    'tf1-plus': 'tf1.fr',
    'm6-plus': '6play.fr',
    ocs: 'ocs.fr',
    universcine: 'universcine.com',
  },
  germany: {
    wow: 'wow.de',
    joyn: 'joyn.de',
    'rtl-plus': 'rtlplus.de',
    'waipu-tv': 'waipu.tv',
    zattoo: 'zattoo.com',
    magentatv: 'telekom.de',
    'sky-deutschland': 'sky.de',
  },
  italy: {
    now: 'nowtv.it',
    raiplay: 'raiplay.it',
    'mediaset-infinity': 'mediasetinfinity.mediaset.it',
    timvision: 'timvision.it',
    'sky-italia': 'sky.it',
    chili: 'chili.tv',
  },
  netherlands: {
    videoland: 'videoland.com',
    'npo-plus': 'npo.nl',
    'ziggo-go': 'ziggo.nl',
    'kpn-tv': 'kpn.com',
    'pathe-thuis': 'pathe.nl',
    viaplay: 'viaplay.com',
  },
  denmark: {
    viaplay: 'viaplay.com',
    'tv2-play': 'tv2.dk',
    drtv: 'dr.dk',
    'c-more': 'cmore.dk',
    storytel: 'storytel.com',
    mofibo: 'mofibo.com',
    podimo: 'podimo.com',
    'yousee-tv': 'yousee.dk',
  },
  sweden: {
    viaplay: 'viaplay.com',
    'tv4-play': 'tv4play.se',
    'svt-play': 'svtplay.se',
    'c-more': 'cmore.se',
    storytel: 'storytel.com',
    bookbeat: 'bookbeat.com',
    podme: 'podme.com',
    'telia-play': 'telia.se',
  },
  norway: {
    viaplay: 'viaplay.com',
    'tv2-play': 'tv2.no',
    'nrk-tv': 'nrk.no',
    storytel: 'storytel.com',
    podme: 'podme.com',
    allente: 'allente.no',
    strim: 'strim.no',
  },
  poland: {
    'player-pl': 'player.pl',
    'tvp-vod': 'vod.tvp.pl',
    'canal-plus-online': 'canalplus.com',
    'polsat-box-go': 'polsatboxgo.pl',
    'cda-premium': 'cda.pl',
    legimi: 'legimi.pl',
    'empik-go': 'empik.com',
    storytel: 'storytel.com',
  },
  russia: {
    kinopoisk: 'kinopoisk.ru',
    okko: 'okko.tv',
    ivi: 'ivi.ru',
    wink: 'wink.ru',
    premier: 'premier.one',
    start: 'start.ru',
    'yandex-plus': 'plus.yandex.ru',
    'vk-music': 'vk.com',
    sberprime: 'sber.ru',
    litres: 'litres.ru',
    'mts-premium': 'mts.ru',
  },
  ukraine: {
    megogo: 'megogo.net',
    'kyivstar-tv': 'kyivstar.ua',
    'sweet-tv': 'sweet.tv',
    'oll-tv': 'oll.tv',
    volia: 'volia.com',
    takflix: 'takflix.com',
  },
  turkey: {
    blutv: 'blutv.com',
    exxen: 'exxen.com',
    gain: 'gain.tv',
    puhutv: 'puhutv.com',
    tabii: 'tabii.com',
    'tv-plus': 'turkcell.com.tr',
    fizy: 'fizy.com',
    'bein-connect': 'beinsports.com.tr',
  },
};

// Confirmed to have no usable asset on Brandfetch as of the last run: the API
// answers "no icon asset available" (or has no brand record at all) rather than
// serving something wrong. Kept here so a future run does not re-litigate them;
// re-check occasionally, since brands do get claimed over time. Anything on this
// list needs artwork from somewhere else if we ever want it.
export const NOT_ON_BRANDFETCH = [
  'abema.tv',
  'amazon.co.jp',
  'animestore.docomo.ne.jp',
  'douyin.com',
  'ele.me',
  'fod.fujitv.co.jp',
  'lemino.docomo.ne.jp',
  'melon.com',
  'millie.co.kr',
  'mubi.com',
  'music-flo.com',
  'oisix.com',
  'onedrive.com',
  'sonyliv.com',
  'tidal.com',
  'tver.jp',
  'wavve.com',
];

const CLIENT_ID = process.env.EXPO_PUBLIC_BRANDFETCH_CLIENT_ID;

async function brandApi(pathname) {
  const res = await fetch(`https://api.brandfetch.io/v2/${pathname}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`Brand API ${pathname}: ${res.status}`);
  return res.json();
}

/** Square app-icon first: that is what matches the account-logo tiles. */
function pickIcon(brand, prefer = ['icon', 'symbol', 'logo']) {
  for (const type of prefer) {
    for (const logo of brand.logos ?? []) {
      if (logo.type !== type) continue;
      const byFormat = Object.fromEntries((logo.formats ?? []).map((f) => [f.format, f.src]));
      for (const fmt of ['png', 'webp', 'jpeg']) {
        if (byFormat[fmt]) return byFormat[fmt];
      }
    }
  }
  return null;
}

/** Ask the CDN for the 256x256 variant of an asset the Brand API pointed at. */
function sized(src) {
  const url = new URL(src);
  const file = url.pathname.split('/').pop();
  const brandId = url.pathname.split('/').filter(Boolean)[0];
  const theme = url.pathname.includes('/theme/dark/') ? 'dark' : 'light';
  return `${url.origin}/${brandId}/w/${SIZE}/h/${SIZE}/theme/${theme}/${file}${url.search}`;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const only = process.argv.slice(2);
const countries = only.length ? only.filter((c) => SUBSCRIPTIONS[c]) : Object.keys(SUBSCRIPTIONS);

for (const country of countries) {
  const dir = path.join(OUT_DIR, country);
  await fs.mkdir(dir, { recursive: true });

  for (const [slug, domain] of Object.entries(SUBSCRIPTIONS[country])) {
    try {
      // The domain-addressed CDN path needs only the publishable client id and
      // is the cheapest route; fall back to the Brand API when it 404s.
      let bytes = null;
      if (CLIENT_ID) {
        const res = await fetch(
          `https://cdn.brandfetch.io/${domain}/w/${SIZE}/h/${SIZE}/icon.png?c=${CLIENT_ID}`,
        );
        if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
      }
      if (!bytes) {
        const src = pickIcon(await brandApi(`brands/${domain}`));
        if (!src) {
          console.warn(`${country}/${slug}: no usable icon`);
          continue;
        }
        bytes = await download(sized(src));
      }
      await fs.writeFile(path.join(dir, `${slug}.png`), bytes);
      console.log(`${country}/${slug} <- ${domain}`);
    } catch (err) {
      console.error(`${country}/${slug} (${domain}):`, err.message);
    }
  }
}
