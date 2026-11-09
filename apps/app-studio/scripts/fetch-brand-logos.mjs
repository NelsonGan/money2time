// Fetch top bank / e-wallet / financial-service logos per country from Brandfetch.
// Normalizes every logo to a uniform 256x256 PNG and writes a manifest.
//
//   node scripts/fetch-brand-logos.mjs            # fetch all
//   node scripts/fetch-brand-logos.mjs malaysia   # fetch one country (by folder slug)
//
// Auth: BRANDFETCH_API_KEY (Bearer) from .env.local — Brand API src URLs carry
// per-request credentials that allow programmatic download.

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "public", "logos");
const SIZE = 256;

// ---- load API key from .env.local ------------------------------------------
function loadKey() {
  const env = readFileSync(join(ROOT, ".env.local"), "utf8");
  const m = env.match(/^BRANDFETCH_API_KEY=(.+)$/m);
  if (!m) throw new Error("BRANDFETCH_API_KEY not found in .env.local");
  return m[1].trim();
}
const KEY = loadKey(); // kept for reference; Search API needs no auth
void KEY;

// ---- country -> [displayName, domain] --------------------------------------
// folder slug : { name, locale, brands: [ [displayName, primaryDomain] ] }
const COUNTRIES = {
  // Borderless institutions — payment networks, global fintech, crypto exchanges,
  // and global brokerages. Listed here once; auto-skipped in country folders (see
  // GLOBAL_SLUGS) so they don't duplicate across markets.
  "global": { name: "Global", locale: "*", brands: [
    // payment networks & global fintech
    ["Visa", "visa.com"], ["Mastercard", "mastercard.com"], ["American Express", "americanexpress.com"],
    ["PayPal", "paypal.com"], ["Wise", "wise.com"], ["Revolut", "revolut.com"],
    ["N26", "n26.com"], ["Klarna", "klarna.com"], ["Payoneer", "payoneer.com"],
    ["Skrill", "skrill.com"], ["Neteller", "neteller.com"], ["Stripe", "stripe.com"],
    ["Western Union", "westernunion.com"], ["Apple Pay", "apple.com", "Apple"],
    ["Google Pay", "pay.google.com", "Google Pay"], ["Samsung Wallet", "samsung.com", "Samsung"],
    // crypto exchanges
    ["Binance", "binance.com"], ["Coinbase", "coinbase.com"], ["Kraken", "kraken.com"],
    ["OKX", "okx.com"], ["Bybit", "bybit.com"], ["Crypto.com", "crypto.com"],
    ["KuCoin", "kucoin.com"], ["Bitget", "bitget.com"], ["Gemini", "gemini.com"],
    ["Gate.io", "gate.io"], ["MEXC", "mexc.com"], ["Bitstamp", "bitstamp.net"],
    // global brokerages & investing
    ["Interactive Brokers", "interactivebrokers.com"], ["moomoo", "moomoo.com"],
    ["Webull", "webull.com"], ["eToro", "etoro.com"], ["Trading 212", "trading212.com"],
    ["XTB", "xtb.com"], ["Tiger Brokers", "tigerbrokers.com"], ["Plus500", "plus500.com"],
    ["IG", "ig.com"], ["Saxo", "home.saxo"],
  ]},
  "united-states": { name: "United States", locale: "en", brands: [
    ["Chase", "chase.com"], ["Bank of America", "bankofamerica.com"],
    ["Wells Fargo", "wellsfargo.com"], ["Citibank", "citi.com"],
    ["Capital One", "capitalone.com"], ["U.S. Bank", "usbank.com"],
    ["PNC Bank", "pncbank.com"], ["Truist", "truist.com"], ["TD Bank", "td.com"],
    ["American Express", "americanexpress.com"], ["Discover", "discover.com"],
    ["Goldman Sachs", "goldmansachs.com"], ["Ally Bank", "ally.com"],
    ["Charles Schwab", "schwab.com"], ["Fidelity", "fidelity.com"],
    ["Vanguard", "vanguard.com"], ["Robinhood", "robinhood.com"],
    ["Coinbase", "coinbase.com"], ["PayPal", "paypal.com"], ["Venmo", "venmo.com"],
    ["Cash App", "cash.app"], ["Zelle", "zellepay.com"], ["Visa", "visa.com"],
    ["Mastercard", "mastercard.com"], ["Chime", "chime.com"], ["SoFi", "sofi.com"],
    ["Navy Federal Credit Union", "navyfederal.org"], ["Citizens Bank", "citizensbank.com"],
    ["Fifth Third Bank", "53.com"], ["KeyBank", "key.com"], ["Regions Bank", "regions.com"],
    ["HSBC", "us.hsbc.com"], ["Apple Pay", "apple.com"], ["Google Pay", "pay.google.com"],
    ["Western Union", "westernunion.com"], ["Wise", "wise.com"], ["Varo Bank", "varomoney.com"],
    ["Current", "current.com"], ["Marcus by Goldman Sachs", "marcus.com"],
    ["E*TRADE", "etrade.com"], ["Synchrony", "synchrony.com"], ["Affirm", "affirm.com"],
    ["Morgan Stanley", "morganstanley.com"], ["USAA", "usaa.com"], ["Betterment", "betterment.com"],
    ["Wealthfront", "wealthfront.com"], ["Acorns", "acorns.com"], ["M1 Finance", "m1.com"],
    ["Public", "public.com"], ["Merrill", "ml.com"], ["TD Ameritrade", "tdameritrade.com"],
  ]},
  "china": { name: "China", locale: "zh", brands: [
    ["ICBC", "icbc.com.cn"], ["China Construction Bank", "ccb.com"],
    ["Agricultural Bank of China", "abchina.com"], ["Bank of China", "boc.cn"],
    ["Bank of Communications", "bankcomm.com"], ["China Merchants Bank", "cmbchina.com"],
    ["Postal Savings Bank of China", "psbc.com"], ["China CITIC Bank", "citicbank.com"],
    ["China Minsheng Bank", "cmbc.com.cn"], ["SPD Bank", "spdb.com.cn"],
    ["Industrial Bank", "cib.com.cn"], ["Ping An Bank", "bank.pingan.com", "Ping An"],
    ["China Everbright Bank", "cebbank.com"], ["Hua Xia Bank", "hxb.com.cn"],
    ["China Guangfa Bank", "gdb.com.cn"], ["China Zheshang Bank", "czbank.com"],
    ["Bank of Beijing", "bankofbeijing.com.cn"], ["Bank of Shanghai", "bosc.cn"],
    ["Bank of Ningbo", "nbcb.com.cn"], ["Bank of Nanjing", "njcb.com.cn"],
    ["China Bohai Bank", "cbhb.com.cn"], ["JD.com", "jd.com"],
    ["Alipay", "alipay.com"], ["WeChat Pay", "wechat.com", "WeChat"], ["UnionPay", "unionpayintl.com"],
    ["Meituan", "meituan.com"], ["Tencent", "tencent.com"], ["WeBank", "webank.com"],
    ["Du Xiaoman", "duxiaoman.com"], ["Lufax", "lufax.com"],
  ]},
  "malaysia": { name: "Malaysia", locale: "ms", brands: [
    ["Maybank", "maybank.com"], ["CIMB", "cimb.com"], ["Public Bank", "pbebank.com"],
    ["RHB Bank", "rhbgroup.com"], ["Hong Leong Bank", "hongleongbank.com.my"],
    ["AmBank", "ambankgroup.com"], ["Bank Islam", "bankislam.com"],
    ["Bank Rakyat", "bankrakyat.com.my"], ["OCBC Malaysia", "ocbc.com", "OCBC"],
    ["UOB Malaysia", "uobgroup.com", "UOB"], ["HSBC Malaysia", "hsbc.com", "HSBC"],
    ["Affin Bank", "affinbank.com.my"], ["Alliance Bank", "alliancebank.com.my"],
    ["Bank Simpanan Nasional", "bsn.com.my"], ["Standard Chartered Malaysia", "sc.com", "Standard Chartered"],
    ["Bank Muamalat", "muamalat.com.my"], ["MBSB Bank", "mbsbbank.com"],
    ["Agrobank", "agrobank.com.my"], ["Al Rajhi Bank", "alrajhibank.com.my"],
    ["Kuwait Finance House", "kfh.com.my"], ["Ryt Bank", "rytbank.my", "rytbank"],
    ["AEON Bank", "aeonbank.com.my"], ["Boost Bank", "myboostbank.co"],
    ["GXBank", "gxbank.my"], ["Touch 'n Go eWallet", "touchngo.com.my", "Touch n Go"],
    ["GrabPay", "grab.com", "Grab"], ["Boost", "myboost.com.my"], ["ShopeePay", "shopee.com", "Shopee"],
    ["BigPay", "bigpayme.com"], ["MAE by Maybank", "maybank2u.com.my"],
    ["Atome", "atome.my"],
    ["EPF (KWSP)", "kwsp.gov.my", "KWSP"], ["PNB", "pnb.com.my"], ["Rakuten Trade", "rakutentrade.my"],
    ["StashAway", "stashaway.my"], ["Kenanga", "kenanga.com.my"], ["Versa", "versa.my"],
    ["Luno", "luno.com"], ["MoneyLion", "moneylion.my"],
  ]},
  "singapore": { name: "Singapore", locale: "en", brands: [
    ["DBS Bank", "dbs.com.sg", "DBS"], ["POSB", "posb.com.sg"],
    ["OCBC", "ocbc.com"], ["UOB", "uobgroup.com"],
    ["Standard Chartered Singapore", "sc.com", "Standard Chartered"],
    ["HSBC Singapore", "hsbc.com.sg", "HSBC"], ["Citibank Singapore", "citibank.com.sg", "Citibank"],
    ["Maybank Singapore", "maybank.com.sg", "Maybank"], ["CIMB Singapore", "cimb.com.sg", "CIMB"],
    ["Bank of China Singapore", "bankofchina.com", "Bank of China"],
    ["Trust Bank", "trustbank.sg"], ["GXS Bank", "gxs.com.sg"],
    ["MariBank", "maribank.sg"], ["ANEXT Bank", "anext.com.sg"],
    ["YouTrip", "you.co"], ["Instarem", "instarem.com"], ["Aspire", "aspireapp.com"],
    ["Singlife", "singlife.com"], ["Endowus", "endowus.com"], ["StashAway", "stashaway.com"],
    ["Syfe", "syfe.com"], ["Tiger Brokers", "tigerbrokers.com.sg", "Tiger Brokers"],
    ["Coinhako", "coinhako.com"], ["Independent Reserve", "independentreserve.com"],
    ["GrabPay", "grab.com", "Grab"], ["ShopeePay", "shopee.sg", "Shopee"],
    ["Apple Pay", "apple.com"], ["Google Pay", "pay.google.com"],
  ]},
  "mexico": { name: "Mexico", locale: "es", brands: [
    ["BBVA México", "bbva.mx"], ["Banorte", "banorte.com"], ["Citibanamex", "banamex.com"],
    ["Santander México", "santander.com", "Santander"], ["HSBC México", "hsbc.com.mx"],
    ["Scotiabank México", "scotiabank.com", "Scotiabank"], ["Banco Azteca", "bancoazteca.com.mx"],
    ["Inbursa", "inbursa.com"], ["BanBajío", "banbajio.com"], ["Banregio", "banregio.com"],
    ["Mercado Pago", "mercadopago.com.mx"], ["Nu México", "nubank.com.mx"], ["Clip", "clip.mx"],
    ["Hey Banco", "heybanco.com"], ["Klar", "klar.mx"], ["BanCoppel", "bancoppel.com"],
    ["Afirme", "afirme.com"], ["Mifel", "mifel.com.mx"], ["Compartamos Banco", "compartamos.com.mx"],
    ["Stori", "storicard.com"], ["Ualá", "uala.mx"], ["Albo", "albo.mx"],
    ["Spin by OXXO", "spinbyoxxo.com.mx"], ["RappiCard", "rappicard.mx"],
    ["American Express", "americanexpress.com"],
  ]},
  "spain": { name: "Spain", locale: "es", brands: [
    ["Santander", "santander.com"], ["BBVA", "bbva.es"], ["CaixaBank", "caixabank.es"],
    ["Banco Sabadell", "bancsabadell.com"], ["Bankinter", "bankinter.com"],
    ["Unicaja Banco", "unicajabanco.es"], ["Kutxabank", "kutxabank.es"],
    ["ING España", "ing.com", "ING"], ["Abanca", "abanca.com"], ["Ibercaja", "ibercaja.es"],
    ["Cajamar", "cajamar.es"], ["Bizum", "bizum.es"], ["Openbank", "openbank.es"],
    ["Revolut", "revolut.com"], ["Banco Pichincha España", "bancopichincha.es"],
    ["EVO Banco", "evobanco.com"], ["Imagin", "imagin.com"], ["N26", "n26.com"],
    ["MyInvestor", "myinvestor.es"], ["Wizink", "wizink.es"], ["PayPal", "paypal.com"],
    ["Caja Rural", "cajarural.com"],
  ]},
  "brazil": { name: "Brazil", locale: "pt", brands: [
    ["Itaú Unibanco", "itau.com.br"], ["Bradesco", "bradesco.com.br"],
    ["Banco do Brasil", "bb.com.br"], ["Caixa Econômica Federal", "caixa.gov.br"],
    ["Santander Brasil", "santander.com.br"], ["Nubank", "nubank.com.br"],
    ["Banco Inter", "bancointer.com.br"], ["BTG Pactual", "btgpactual.com"],
    ["Banco Safra", "safra.com.br"], ["Banrisul", "banrisul.com.br"],
    ["Sicoob", "sicoob.com.br"], ["Mercado Pago", "mercadopago.com.br"],
    ["PicPay", "picpay.com"], ["PagBank", "pagbank.com.br"],
    ["Neon", "neon.com.br"], ["C6 Bank", "c6bank.com.br"], ["Banco BMG", "bancobmg.com.br"],
    ["Banco Pan", "bancopan.com.br"], ["Banco Original", "original.com.br"],
    ["Will Bank", "willbank.com.br"], ["Sicredi", "sicredi.com.br"],
    ["Banco Votorantim (BV)", "bv.com.br"], ["Ame Digital", "amedigital.com"],
    ["Banco BS2", "bs2.com"], ["Banco Daycoval", "bancodaycoval.com.br"],
    ["XP Investimentos", "xpi.com.br"], ["Rico", "rico.com.vc"],
    ["Mercado Bitcoin", "mercadobitcoin.com.br"], ["Foxbit", "foxbit.com.br"],
    ["BTG Pactual digital", "btgpactualdigital.com"],
  ]},
  "portugal": { name: "Portugal", locale: "pt", brands: [
    ["Caixa Geral de Depósitos", "cgd.pt"], ["Millennium BCP", "millenniumbcp.pt"],
    ["Novobanco", "novobanco.pt"], ["Santander Portugal", "santander.pt"],
    ["BPI", "bancobpi.pt"], ["Banco Montepio", "bancomontepio.pt"],
    ["Crédito Agrícola", "creditoagricola.pt"], ["ActivoBank", "activobank.pt"],
    ["Banco CTT", "bancoctt.pt"], ["EuroBic", "eurobic.pt"],
    ["Bankinter Portugal", "bankinter.pt"], ["Banco Best", "bancobest.pt"],
    ["BiG", "big.pt"], ["Moey!", "moey.pt"], ["Cofidis", "cofidis.pt"],
    ["MB WAY", "mbway.pt"], ["Revolut", "revolut.com"], ["N26", "n26.com"],
    ["Wise", "wise.com"], ["PayPal", "paypal.com"],
  ]},
  "germany": { name: "Germany", locale: "de", brands: [
    ["Deutsche Bank", "db.com"], ["Commerzbank", "commerzbank.de"],
    ["DZ Bank", "dzbank.com"], ["Sparkasse", "sparkasse.de"],
    ["Volksbank Raiffeisenbank", "volksbank.de"], ["ING Deutschland", "ing.com", "ING"],
    ["DKB", "dkb.de"], ["Postbank", "postbank.de"],
    ["HypoVereinsbank", "hypovereinsbank.de"], ["comdirect", "comdirect.de"],
    ["Targobank", "targobank.de"], ["Santander Deutschland", "santander.de"],
    ["N26", "n26.com"], ["Trade Republic", "traderepublic.com"],
    ["Revolut", "revolut.com"], ["PayPal", "paypal.com"], ["C24 Bank", "c24.de"],
    ["Norisbank", "norisbank.de"], ["1822direkt", "1822direkt.de"],
    ["Consorsbank", "consorsbank.de"], ["Tomorrow", "tomorrow.one"],
    ["Sparda-Bank", "sparda.de"], ["Scalable Capital", "scalable.capital"],
    ["Bitpanda", "bitpanda.com"], ["Vivid", "vivid.money"],
  ]},
  "france": { name: "France", locale: "fr", brands: [
    ["BNP Paribas", "bnpparibas"], ["Crédit Agricole", "credit-agricole.com"],
    ["Société Générale", "societegenerale.com"], ["Banque Populaire", "banquepopulaire.fr"],
    ["Caisse d'Épargne", "caisse-epargne.fr"], ["Crédit Mutuel", "creditmutuel.fr"],
    ["La Banque Postale", "labanquepostale.fr"], ["LCL", "lcl.fr"],
    ["Boursorama", "boursorama.com"], ["Hello bank!", "hellobank.fr"],
    ["Fortuneo", "fortuneo.fr"], ["Nickel", "nickel.eu"], ["Qonto", "qonto.com"],
    ["Revolut", "revolut.com"], ["Lydia", "lydia-app.com"], ["N26", "n26.com"],
    ["PayPal", "paypal.com"], ["BforBank", "bforbank.com"], ["Monabanq", "monabanq.com"],
    ["Sumeria", "sumeria.fr"],
    ["Crédit du Nord", "creditdunord.fr"], ["AXA Banque", "axa-banque.fr"],
    ["Paylib", "paylib.fr"], ["Apple Pay", "apple.com"],
  ]},
  "italy": { name: "Italy", locale: "it", brands: [
    ["Intesa Sanpaolo", "intesasanpaolo.com"], ["UniCredit", "unicredit.it"],
    ["Banco BPM", "bancobpm.it"], ["BPER Banca", "bper.it"],
    ["Monte dei Paschi di Siena", "mps.it"], ["Mediobanca", "mediobanca.com"],
    ["Poste Italiane", "posteitaliane.it"], ["BNL", "bnl.it"],
    ["Banca Mediolanum", "bancamediolanum.it"], ["FinecoBank", "finecobank.com"],
    ["Crédit Agricole Italia", "credit-agricole.it"], ["Hype", "hype.it"],
    ["Satispay", "satispay.com"], ["Nexi", "nexi.it"], ["Banca Sella", "bancasella.com"],
    ["Credem", "credem.it"], ["Banca Popolare di Sondrio", "popso.it"],
    ["Widiba", "widiba.it"], ["Illimity", "illimity.com"], ["Buddybank", "buddybank.com"],
    ["Revolut", "revolut.com"], ["PostePay", "postepay.it"], ["PayPal", "paypal.com"],
  ]},
  "india": { name: "India", locale: "hi", brands: [
    ["State Bank of India", "sbi.co.in"], ["HDFC Bank", "hdfcbank.com"],
    ["ICICI Bank", "icicibank.com"], ["Axis Bank", "axisbank.com"],
    ["Kotak Mahindra Bank", "kotak.com"], ["Punjab National Bank", "pnbindia.in"],
    ["Bank of Baroda", "bankofbaroda.in"], ["Canara Bank", "canarabank.com"],
    ["IndusInd Bank", "indusind.com"], ["Yes Bank", "yesbank.in"],
    ["IDFC First Bank", "idfcfirstbank.com"], ["Bank of India", "bankofindia.co.in"],
    ["Paytm", "paytm.com"], ["PhonePe", "phonepe.com"], ["Google Pay", "pay.google.com"],
    ["Amazon Pay", "amazon.in"], ["Union Bank of India", "unionbankofindia.co.in"],
    ["IDBI Bank", "idbibank.in"], ["Federal Bank", "federalbank.co.in"],
    ["RBL Bank", "rblbank.com"], ["Bandhan Bank", "bandhanbank.com"],
    ["AU Small Finance Bank", "aubank.in"], ["Cred", "cred.club"],
    ["BHIM", "bhimupi.org.in"], ["Mobikwik", "mobikwik.com"],
    ["Zerodha", "zerodha.com"], ["Groww", "groww.in"], ["Upstox", "upstox.com"],
    ["Angel One", "angelone.in"], ["Bajaj Finserv", "bajajfinserv.in"],
    ["WazirX", "wazirx.com"], ["CoinDCX", "coindcx.com"],
  ]},
  "indonesia": { name: "Indonesia", locale: "id", brands: [
    ["Bank Central Asia", "bca.co.id"], ["Bank Mandiri", "bankmandiri.co.id"],
    ["Bank Rakyat Indonesia", "bri.co.id"], ["Bank Negara Indonesia", "bni.co.id"],
    ["CIMB Niaga", "cimbniaga.co.id"], ["Bank Danamon", "danamon.co.id"],
    ["Bank Syariah Indonesia", "bankbsi.co.id"], ["Permata Bank", "permatabank.com"],
    ["Bank Jago", "jago.com"], ["SeaBank", "seabank.co.id"],
    ["GoPay", "gopay.co.id"], ["OVO", "ovo.id"], ["DANA", "dana.id"],
    ["LinkAja", "linkaja.id"], ["ShopeePay", "shopee.co.id"],
    ["Bank BTN", "btn.co.id"], ["OCBC Indonesia", "ocbc.id"],
    ["Maybank Indonesia", "maybank.co.id"], ["Bank Mega", "bankmega.com"],
    ["Allo Bank", "allobank.com"], ["Bank Neo Commerce", "bankneocommerce.co.id"],
    ["Krom Bank", "krombank.com"], ["Blu by BCA Digital", "blubca.co.id"],
    ["Bibit", "bibit.id"], ["Ajaib", "ajaib.co.id"], ["Pluang", "pluang.com"],
    ["Indodax", "indodax.com"], ["Stockbit", "stockbit.com"], ["Jenius", "jenius.com"],
  ]},
  "japan": { name: "Japan", locale: "ja", brands: [
    ["MUFG Bank", "mufg.jp"], ["SMBC", "smbc.co.jp"], ["Mizuho Bank", "mizuhobank.co.jp"],
    ["Japan Post Bank", "jp-bank.japanpost.jp"], ["Resona Bank", "resonabank.co.jp"],
    ["Rakuten Bank", "rakuten-bank.co.jp"], ["Seven Bank", "sevenbank.co.jp"],
    ["Aeon Bank", "aeonbank.co.jp"], ["SBI Sumishin Net Bank", "netbk.co.jp"],
    ["PayPay", "paypay.ne.jp"], ["Rakuten Pay", "pay.rakuten.co.jp"],
    ["d Pay", "docomo.ne.jp"], ["Merpay", "merpay.com"],
    ["LINE Pay", "line.me"], ["au PAY", "aupay.auone.jp"], ["SBI Securities", "sbisec.co.jp"],
    ["Sony Bank", "sonybank.net"], ["au Jibun Bank", "jibunbank.co.jp"],
    ["GMO Aozora Net Bank", "gmo-aozora.com"], ["PayPay Bank", "paypay-bank.co.jp"],
    ["JCB", "jcb.com"], ["WAON", "waon.net"], ["nanaco", "nanaco-net.jp"],
    ["Suica", "jreast.co.jp"], ["Nomura", "nomura.com"], ["Daiwa Securities", "daiwa.jp"],
    ["Monex", "monex.co.jp"], ["Rakuten Securities", "rakuten-sec.co.jp"],
    ["bitFlyer", "bitflyer.com"], ["Coincheck", "coincheck.com"],
  ]},
  // 3rd element = search query. Most Taiwanese institutions are indexed only by
  // their domain (an English name query returns nothing, or an unrelated
  // same-name Western entity — e.g. "First Bank" resolves to the US firstbank.com),
  // so search by domain wherever the plain name misses.
  "taiwan": { name: "Taiwan", locale: "zh", brands: [
    // retail & commercial banks
    ["CTBC Bank", "ctbcbank.com"], ["Cathay United Bank", "cathaybk.com.tw"],
    ["E.SUN Bank", "esunbank.com.tw"],
    ["Taishin Bank", "taishinbank.com.tw", "taishinbank.com.tw"],
    // taipeifubon.com.tw is indexed but only as a "T" lettermark; fubon.com carries
    // the real Fubon mark.
    ["Fubon Bank", "fubon.com", "fubon.com"],
    ["Mega Bank", "megabank.com.tw", "megabank.com.tw"],
    ["First Bank", "firstbank.com.tw", "firstbank.com.tw"],
    ["Hua Nan Bank", "hncb.com.tw", "hncb.com.tw"],
    ["Chang Hwa Bank", "bankchb.com", "bankchb.com"],
    ["Bank of Taiwan", "bot.com.tw", "bot.com.tw"],
    ["Taiwan Cooperative Bank", "tcb-bank.com.tw"],
    ["Land Bank of Taiwan", "landbank.com.tw", "landbank.com.tw"],
    ["Shanghai Commercial & Savings Bank", "scsb.com.tw", "Shanghai Commercial Savings Bank"],
    ["Bank SinoPac", "sinopac.com", "sinopac.com"],
    ["Union Bank of Taiwan", "ubot.com.tw", "ubot.com.tw"],
    ["Yuanta Bank", "yuantabank.com.tw", "yuantabank.com.tw"],
    ["Taiwan Business Bank", "tbb.com.tw"],
    ["DBS Taiwan", "dbs.com.tw", "DBS"], ["HSBC Taiwan", "hsbc.com.tw", "HSBC"],
    ["Standard Chartered Taiwan", "sc.com", "Standard Chartered"],
    // digital-only banks
    ["Rakuten Bank Taiwan", "rakuten-bank.com.tw", "Rakuten Bank"],
    ["Next Bank", "nextbank.com.tw"], ["Richart", "richart.tw", "richart.tw"],
    // e-wallets & payments
    ["LINE Pay", "line.me", "line.me"], ["JKOPay", "jkos.com", "jkos.com"],
    ["EasyCard", "easycard.com.tw"], ["icash Pay", "icashpay.com.tw"],
    ["PXPay Plus", "pxpayplus.com"], ["Taiwan Pay", "twmp.com.tw", "twmp.com.tw"],
    // brokerages & crypto
    ["Yuanta Securities", "yuanta.com.tw", "yuanta.com.tw"],
    ["Capital Securities", "capital.com.tw", "capital.com.tw"],
    ["KGI Securities", "kgi.com", "kgi.com"],
    ["MaiCoin", "maicoin.com"], ["BitoPro", "bitopro.com"],
    ["XREX", "xrex.io", "xrex.io"], ["ACE Exchange", "aceex.io", "aceex.io"],
    // Not in the Brandfetch free search index (checked by name and by domain):
    // KGI Bank (kgibank.com.tw), Far Eastern International Bank (feib.com.tw),
    // Shin Kong Bank (skbank.com.tw), Sunny Bank, King's Town Bank, O-Bank,
    // Chunghwa Post, LINE Bank (linebank.com.tw), iPASS / iPASS MONEY,
    // Pi Wallet, Cathay Securities.
  ]},
  "south-korea": { name: "South Korea", locale: "ko", brands: [
    ["KB Kookmin Bank", "kbkookminbank.com"], ["Shinhan Bank", "shinhan.com"],
    ["Woori Bank", "wooribank.com"], ["Hana Bank", "kebhana.com"],
    ["NongHyup Bank", "nonghyup.com"], ["IBK", "ibk.co.kr"],
    ["KakaoBank", "kakaobank.com"], ["Toss Bank", "tossbank.com"], ["K bank", "kbanknow.com"],
    ["Toss", "toss.im"], ["Kakao Pay", "kakaopay.com"], ["Naver Pay", "naver.com"],
    ["Samsung Pay", "samsung.com"], ["Payco", "payco.com"],
    ["Busan Bank", "busanbank.co.kr"], ["Daegu Bank (iM Bank)", "imbank.co.kr"],
    ["Suhyup Bank", "suhyup-bank.com"], ["Standard Chartered Korea", "standardchartered.co.kr"],
    ["Citibank Korea", "citibank.co.kr"], ["SSGPAY", "ssgpay.com"],
    ["Mirae Asset", "miraeasset.com"], ["Korea Investment", "truefriend.com"],
    ["Upbit", "upbit.com"], ["Bithumb", "bithumb.com"],
  ]},
  "indonesia-dummy": undefined, // placeholder removed below
  "denmark": { name: "Denmark", locale: "da", brands: [
    ["Danske Bank", "danskebank.com"], ["Nordea", "nordea.com"],
    ["Jyske Bank", "jyskebank.dk"], ["Sydbank", "sydbank.dk"],
    ["Nykredit", "nykredit.dk"], ["Spar Nord", "sparnord.dk"],
    ["Arbejdernes Landsbank", "al-bank.dk"], ["MobilePay", "mobilepay.dk"],
    ["Lunar", "lunar.app"], ["Saxo Bank", "home.saxo"], ["Vestjysk Bank", "vestjyskbank.dk"],
    ["Ringkjøbing Landbobank", "landbobanken.dk"], ["Coop Bank", "coopbank.dk"],
    ["Basisbank", "basisbank.dk"], ["Revolut", "revolut.com"], ["Klarna", "klarna.com"],
    ["Handelsbanken Danmark", "handelsbanken.dk"], ["Apple Pay", "apple.com"],
  ]},
  "norway": { name: "Norway", locale: "nb", brands: [
    ["DNB", "dnb.no"], ["Nordea Norge", "nordea.no"], ["SpareBank 1", "sparebank1.no"],
    ["Handelsbanken", "handelsbanken.no"], ["Storebrand", "storebrand.no"],
    ["Sbanken", "sbanken.no"], ["Gjensidige", "gjensidige.no"],
    ["Vipps", "vipps.no"], ["Danske Bank", "danskebank.no"], ["KLP", "klp.no"],
    ["Eika", "eika.no"], ["BN Bank", "bnbank.no"], ["Sparebanken Vest", "spv.no"],
    ["Sparebanken Sør", "sor.no"], ["Skandiabanken", "skandiabanken.no"],
    ["Bank Norwegian", "banknorwegian.no"], ["Instabank", "instabank.no"],
    ["Revolut", "revolut.com"], ["Klarna", "klarna.com"],
  ]},
  "netherlands": { name: "Netherlands", locale: "nl", brands: [
    ["ING", "ing.nl"], ["Rabobank", "rabobank.nl"], ["ABN AMRO", "abnamro.nl"],
    ["SNS", "snsbank.nl"], ["bunq", "bunq.com"], ["ASN Bank", "asnbank.nl"],
    ["Knab", "knab.nl"], ["Triodos Bank", "triodos.com"], ["de Volksbank", "devolksbank.nl"],
    ["Revolut", "revolut.com"], ["iDEAL", "ideal.nl"], ["Tikkie", "tikkie.me"],
    ["RegioBank", "regiobank.nl"], ["Van Lanschot", "vanlanschotkempen.com"],
    ["N26", "n26.com"], ["Wise", "wise.com"], ["PayPal", "paypal.com"],
    ["Apple Pay", "apple.com"],
  ]},
  "poland": { name: "Poland", locale: "pl", brands: [
    ["PKO Bank Polski", "pkobp.pl"], ["Bank Pekao", "pekao.com.pl"],
    ["Santander Bank Polska", "santander.pl"], ["mBank", "mbank.pl"],
    ["ING Bank Śląski", "ing.pl"], ["BNP Paribas Polska", "bnpparibas.pl"],
    ["Bank Millennium", "bankmillennium.pl"], ["Alior Bank", "aliorbank.pl"],
    ["Citi Handlowy", "citibank.pl"], ["Credit Agricole Polska", "credit-agricole.pl"],
    ["BLIK", "blik.com"], ["Revolut", "revolut.com"], ["Nest Bank", "nestbank.pl"],
    ["Velo Bank", "velobank.pl"], ["Bank Pocztowy", "pocztowy.pl"],
    ["Bank Ochrony Środowiska", "bosbank.pl"], ["Plus Bank", "plusbank.pl"],
    ["Getin Bank", "getinbank.pl"], ["PayU", "payu.pl"], ["Przelewy24", "przelewy24.pl"],
    ["Apple Pay", "apple.com"],
  ]},
  "russia": { name: "Russia", locale: "ru", brands: [
    ["Sberbank", "sberbank.ru"], ["VTB", "vtb.ru"], ["Gazprombank", "gazprombank.ru"],
    ["Alfa-Bank", "alfabank.ru"], ["T-Bank (Tinkoff)", "tinkoff.ru"],
    ["Rosselkhozbank", "rshb.ru"], ["Otkritie", "open.ru"],
    ["Raiffeisenbank", "raiffeisen.ru"], ["Sovcombank", "sovcombank.ru"],
    ["Rosbank", "rosbank.ru"], ["MTS Bank", "mtsbank.ru"], ["Pochta Bank", "pochtabank.ru"],
    ["YooMoney", "yoomoney.ru"], ["Uralsib", "uralsib.ru"],
    ["Promsvyazbank", "psbank.ru"], ["Ak Bars Bank", "akbars.ru"],
    ["Home Credit Bank", "homecredit.ru"], ["Ozon Bank", "ozon.ru"],
  ]},
  "sweden": { name: "Sweden", locale: "sv", brands: [
    ["Swedbank", "swedbank.se"], ["Handelsbanken", "handelsbanken.se"],
    ["SEB", "seb.se"], ["Nordea", "nordea.se"], ["Länsförsäkringar", "lansforsakringar.se"],
    ["Skandia", "skandia.se"], ["Swish", "swish.nu"], ["Klarna", "klarna.com"],
    ["Avanza", "avanza.se"], ["ICA Banken", "icabanken.se"], ["SBAB", "sbab.se"],
    ["Sparbanken Syd", "sparbankensyd.se"], ["Marginalen Bank", "marginalen.se"],
    ["Resurs Bank", "resursbank.se"], ["Nordnet", "nordnet.se"],
    ["Revolut", "revolut.com"], ["Trustly", "trustly.com"], ["Apple Pay", "apple.com"],
  ]},
  "thailand": { name: "Thailand", locale: "th", brands: [
    ["Bangkok Bank", "bangkokbank.com"], ["Kasikornbank", "kasikornbank.com"],
    ["Siam Commercial Bank", "scb.co.th", "SCB Thailand"], ["Krungthai Bank", "krungthai.com"],
    ["Krungsri", "krungsri.com"], ["TTB Bank", "ttbbank.com"],
    ["Government Savings Bank", "gsb.or.th"], ["UOB Thailand", "uob.co.th"],
    ["CIMB Thai", "cimbthai.com"], ["Kiatnakin Phatra", "kiatnakin.co.th"],
    ["TrueMoney", "truemoney.com"], ["Rabbit LINE Pay", "rabbit.co.th"],
    ["ShopeePay Thailand", "shopeepay.co.th"], ["LH Bank", "lhbank.co.th"],
    ["Tisco Bank", "tisco.co.th"], ["Thai Credit Bank", "thaicreditbank.com"],
    ["GHB", "ghbank.co.th"], ["BAAC", "baac.or.th"], ["PromptPay", "promptpay.io"],
    ["Bitkub", "bitkub.com"], ["Dime!", "dime.co.th"],
  ]},
  "turkey": { name: "Turkey", locale: "tr", brands: [
    // 3rd element = ASCII search query (Turkish diacritics break the search index)
    ["Ziraat Bankası", "ziraatbank.com.tr", "Ziraat"], ["İşbank", "isbank.com.tr", "Isbank"],
    ["Garanti BBVA", "garantibbva.com", "Garanti BBVA"], ["Akbank", "akbank.com"],
    ["Yapı Kredi", "yapikredi.com.tr", "Yapi Kredi"], ["VakıfBank", "vakifbank.com.tr", "Vakifbank"],
    ["Halkbank", "halkbank.com.tr"], ["QNB Finansbank", "finansbank.com.tr", "Finansbank"],
    ["DenizBank", "denizbank.com"], ["Kuveyt Türk", "kuveytturk.com.tr"],
    ["Türkiye Finans", "turkiyefinans.com.tr"],
    ["Papara", "papara.com"], ["Enpara", "enpara.com"], ["TEB", "teb.com.tr"],
    ["Şekerbank", "sekerbank.com.tr", "Sekerbank"], ["Odeabank", "odeabank.com.tr"],
    ["ING Türkiye", "ing.com.tr"], ["Albaraka Türk", "albaraka.com.tr"],
    ["Fibabanka", "fibabanka.com.tr"], ["ininal", "ininal.com"],
    ["Midas", "getmidas.com"], ["BtcTurk", "btcturk.com"], ["Paribu", "paribu.com"],
  ]},
  "ukraine": { name: "Ukraine", locale: "uk", brands: [
    ["Ukrgasbank", "ukrgasbank.com"], ["Raiffeisen Bank Ukraine", "raiffeisen.ua"],
    ["monobank", "monobank.ua"], ["PUMB", "pumb.ua"],
    ["UkrSibbank", "ukrsibbank.com"], ["Sense Bank", "sensebank.com.ua"],
    ["OTP Bank Ukraine", "otpbank.com.ua"], ["A-Bank", "a-bank.com.ua"],
    ["Credit Agricole Ukraine", "credit-agricole.ua"], ["Ukreximbank", "eximb.com"],
    ["Universal Bank (mono)", "universalbank.com.ua"],
    ["Kredobank", "kredobank.com.ua"], ["TAScombank", "tascombank.ua"],
    ["Bank Vostok", "bankvostok.com.ua"], ["Privat24", "privat24.ua"],
    // Not in Brandfetch index (official records): PrivatBank (privatbank.ua), Oschadbank (oschadbank.ua)
  ]},
  "vietnam": { name: "Vietnam", locale: "vi", brands: [
    ["Vietcombank", "vietcombank.com.vn"], ["BIDV", "bidv.com.vn"],
    ["VietinBank", "vietinbank.vn"],
    ["Techcombank", "techcombank.com.vn"],
    ["VPBank", "vpbank.com.vn"], ["ACB", "acb.com.vn"], ["Sacombank", "sacombank.com.vn"],
    ["TPBank", "tpb.vn"], ["HDBank", "hdbank.com.vn"], ["VIB", "vib.com.vn"],
    ["SHB", "shb.com.vn"], ["MoMo", "momo.vn"], ["ZaloPay", "zalopay.vn"],
    ["VNPay", "vnpay.vn"], ["Viettel Money", "viettelmoney.vn"],
    ["OCB", "ocb.com.vn"], ["Eximbank", "eximbank.com.vn"], ["SeABank", "seabank.com.vn"],
    ["MSB", "msb.com.vn"], ["Nam A Bank", "namabank.com.vn"], ["Cake by VPBank", "cake.vn"],
    ["Timo", "timo.vn"], ["ShopeePay Vietnam", "shopee.com", "Shopee"],
    ["SSI", "ssi.com.vn"], ["VNDirect", "vndirect.com.vn"], ["Finhay", "finhay.com.vn"],
    // Not in Brandfetch index: Agribank (agribank.com.vn), MB Bank (mbbank.com.vn)
  ]},
  "philippines": { name: "Philippines", locale: "fil", brands: [
    ["BDO Unibank", "bdo.com.ph"], ["BPI", "bpi.com.ph"], ["Metrobank", "metrobank.com.ph"],
    ["PNB", "pnb.com.ph"], ["UnionBank", "unionbankph.com"],
    ["Security Bank", "securitybank.com"], ["RCBC", "rcbc.com"],
    ["China Bank", "chinabank.ph"], ["EastWest Bank", "eastwestbanker.com"],
    ["GCash", "gcash.com"], ["Maya", "maya.ph"], ["GoTyme Bank", "gotyme.com.ph"],
    ["UnionDigital Bank", "uniondigitalbank.io"], ["CIMB Bank PH", "cimbbank.com.ph"],
    ["Tonik", "tonikbank.com"], ["SeaBank Philippines", "seabank.com.ph"],
    ["Robinsons Bank", "robinsonsbank.com.ph"], ["PSBank", "psbank.com.ph"],
    ["BPI Direct BanKo", "banko.com.ph"], ["GrabPay PH", "grab.com", "Grab"],
    ["ShopeePay Philippines", "shopee.com", "Shopee"],
    ["COL Financial", "colfinancial.com"],
    // Not in Brandfetch index: Landbank of the Philippines (landbank.com)
  ]},
};
delete COUNTRIES["indonesia-dummy"];

// Blocklist: "folder|slug" pairs that Brandfetch's free search resolves to the
// WRONG entity (name/root collision with an unrelated indexed company) or to a
// lettermark fallback. Verified visually; skip so re-runs never re-fetch them.
// Their real domains aren't in the free Search index (Brand API quota exhausted).
const BLOCKLIST = new Set([
  "malaysia|agrobank",       // -> agrobank.com.ua (Ukraine Agrobank)
  "vietnam|eximbank",        // -> Türk Eximbank (Turkey)
  "indonesia|allo-bank",     // -> allobank.com.br lettermark (Brazil)
  "germany|tomorrow",        // -> tomorrow.io (climate API)
  "norway|vipps",            // -> vipps.com.my "VIPPS CLINIC"
  "turkey|tosla",            // -> tosla.si (unrelated)
  "indonesia|dana",          // -> dana.com (Dana Inc, auto parts)
  "indonesia|gopay",         // -> gopay.com (Czech GoPay gateway)
  "indonesia|linkaja",       // -> linkaja.com lettermark
  "indonesia|seabank",       // -> seabank.com.vn lettermark
  "france|paylib",           // -> lettermark fallback
  "thailand|promptpay",      // -> promptpay.scb (= SCB's own logo)
  "france|sumeria",          // -> blank/unrelated app icon
  "china|lufax",             // -> lettermark "L" fallback
  "vietnam|ssi",             // -> ssi.dk (Danish entity)
  "japan|monex",             // -> monex.com "M" lettermark
  "malaysia|moneylion",      // -> not a MY institution
  "norway|eika",             // -> eika.com = "bolsius" candle company
  "china|du-xiaoman",        // -> "D" lettermark
  "south-korea|korea-investment", // -> "T" lettermark
  "vietnam|vndirect",        // -> "V" lettermark
  "malaysia|pnb",            // -> Philippine PNB logo (pnb root collision)
  "turkey|btcturk",          // -> "B" lettermark
  "taiwan|next-bank",        // -> "N" lettermark
  "taiwan|maicoin",          // -> "M" lettermark
  "taiwan|yuanta-securities",// -> "Y" lettermark
  "taiwan|capital-securities",// -> "C" lettermark
  "taiwan|xrex",             // -> "X" lettermark
  "taiwan|taiwan-pay",       // -> TWMP corporate wordmark, no TaiwanPay branding
]);

// ---- helpers ---------------------------------------------------------------
const slug = (s) => s.toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// slugs that live in the "global" folder — skipped in country folders to dedupe
const GLOBAL_SLUGS = new Set(COUNTRIES.global.brands.map(([n]) => slug(n)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Search API is free (500k/mo, no Bearer auth) and its `icon` URL is directly
// downloadable. The Brand API is NOT used — it caps at ~100 req/mo.
// It does have a burst rate limit, so back off and retry on 429.
const RATE_LIMITED = Symbol("rate-limited");
async function search(name) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`https://api.brandfetch.io/v2/search/${encodeURIComponent(name)}`);
    if (r.status === 429) { await sleep(15000 * (attempt + 1)); continue; } // 15..90s, outlast per-minute window
    if (!r.ok) return [];
    return r.json();
  }
  return RATE_LIMITED; // give up this pass; brand left for next resume run
}

// Registrable label of a domain: "ally" from ally.com, "hsbc" from us.hsbc.com
// or hsbc.com.my, "nubank" from nubank.com.mx.
const PUBLIC_2LD = new Set(["com", "co", "org", "net", "gov", "edu", "ac", "go", "or", "ne", "biz"]);
function rootOf(domain) {
  const labels = String(domain).toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(".");
  if (labels.length < 2) return labels[0] || "";
  const secondLast = labels[labels.length - 2];
  return PUBLIC_2LD.has(secondLast) ? (labels[labels.length - 3] || secondLast) : secondLast;
}

// STRICT: only accept a hit that is unambiguously the same brand as our curated
// domain — exact domain, or same registrable root (length >= 3). Never fall back
// to a top/verified hit, which produces wrong-entity garbage for unindexed domains.
function chooseHit(hits, domain) {
  if (!Array.isArray(hits) || !hits.length) return null;
  const exact = hits.find((h) => h.domain === domain);
  if (exact) return exact;
  const root = rootOf(domain);
  if (root.length < 3) return null;
  return hits.find((h) => h.domain && rootOf(h.domain) === root) || null;
}

// rewrite a search `icon` URL -> uniform SIZE x SIZE PNG
function renderUrl(icon) {
  return icon
    .replace(/\/w\/\d+\/h\/\d+/, `/w/${SIZE}/h/${SIZE}`)
    .replace(/\/icon\.[a-z0-9]+\?/i, "/icon.png?");
}

async function resolveOne(name, domain, searchName) {
  const hits = await search(searchName || name);
  if (hits === RATE_LIMITED) return { rateLimited: true };
  const hit = chooseHit(hits, domain);
  if (!hit?.icon) return { picked: null, resolvedDomain: domain };
  return {
    picked: { url: renderUrl(hit.icon) },
    resolvedDomain: hit.domain || domain,
    logoType: "icon",
  };
}

async function run() {
  const only = process.argv.slice(2);
  // merge into existing manifest so partial re-runs don't wipe other countries
  const manifestPath = join(OUT, "manifest.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { generatedAt: new Date().toISOString(), size: SIZE, countries: {} };
  manifest.generatedAt = new Date().toISOString();
  manifest.size = SIZE;
  const noLogo = [];   // genuine: search succeeded but no valid match
  const deferred = []; // rate-limited this pass; retry on next run
  let ok = 0, skipped = 0, total = 0;

  for (const [folder, def] of Object.entries(COUNTRIES)) {
    if (only.length && !only.includes(folder)) continue;
    const dir = join(OUT, folder);
    mkdirSync(dir, { recursive: true });
    // start from existing manifest entries for this country (resume)
    const prev = new Map((manifest.countries[folder]?.brands || []).map((b) => [b.slug, b]));
    const entries = [];
    const seen = new Set();
    console.log(`\n=== ${def.name} (${folder}) ===`);

    for (const [name, domain, searchName] of def.brands) {
      total++;
      const fileSlug = slug(name);
      if (seen.has(fileSlug)) continue; // dedupe within country
      seen.add(fileSlug);
      if (BLOCKLIST.has(`${folder}|${fileSlug}`)) continue; // known wrong-entity match
      if (folder !== "global" && GLOBAL_SLUGS.has(fileSlug)) continue; // dedupe: lives in "global"

      // RESUME: keep existing logo if the PNG is already on disk
      const existing = prev.get(fileSlug);
      if (existing && existsSync(join(dir, existing.file))) {
        entries.push(existing); skipped++;
        continue;
      }

      await sleep(1200); // stay under the Search API ~per-minute cap
      try {
        const r = await resolveOne(name, domain, searchName);
        if (r.rateLimited) { deferred.push(`${folder}/${name}`); console.log(`  … ${name} (rate-limited, deferred)`); continue; }
        if (!r.picked) { noLogo.push(`${folder}/${name} (curated=${domain})`); console.log(`  ✗ ${name} (no match)`); continue; }
        const res = await fetch(r.picked.url);
        if (!res.ok) { deferred.push(`${folder}/${name} — dl ${res.status}`); console.log(`  … ${name} (dl ${res.status}, deferred)`); continue; }
        const buf = Buffer.from(await res.arrayBuffer());
        const file = `${fileSlug}.png`;
        writeFileSync(join(dir, file), buf);
        entries.push({ name, slug: fileSlug, domain: r.resolvedDomain, file, logoType: r.logoType });
        ok++;
        const warn = r.resolvedDomain !== domain ? `  ⚠︎ curated=${domain}` : "";
        console.log(`  ✓ ${name}  ${r.resolvedDomain}  ${(buf.length/1024).toFixed(0)}KB${warn}`);
      } catch (e) {
        deferred.push(`${folder}/${name} — ${e.message}`);
        console.log(`  … ${name} (${e.message}, deferred)`);
      }
    }
    // sort entries by display name for stable manifest
    entries.sort((a, b) => a.name.localeCompare(b.name));
    manifest.countries[folder] = { name: def.name, locale: def.locale, brands: entries };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); // checkpoint per country
  }

  console.log(`\nDone: new=${ok} kept=${skipped} (total in manifest), of ${total} candidates.`);
  if (noLogo.length) { console.log(`\n${noLogo.length} no-match (not in Brandfetch / wrong domain):`); noLogo.forEach((f) => console.log("  - " + f)); }
  if (deferred.length) { console.log(`\n${deferred.length} DEFERRED (rate-limited — re-run to retry):`); deferred.forEach((f) => console.log("  - " + f)); }
}

run();
