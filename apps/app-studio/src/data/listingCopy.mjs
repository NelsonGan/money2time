/**
 * The store listing text App Studio writes: the app name, the iOS subtitle and
 * keyword field, and Play's short description, per App Studio language.
 *
 * Plain ESM rather than TypeScript, like `storeLocales.mjs`, so the upload code
 * and the tests can import it as well as the Descriptions page.
 */

/**
 * The one name the app goes by, on both stores and in every locale. Play let a
 * localized zh-CN title in at some point; sending this for every locale is what
 * takes it back out.
 */
export const APP_NAME = 'Money2Time: Expense Tracker';

/**
 * The iOS subtitle, 30 characters. It says the category plainly, because that
 * is the phrase people actually type. It repeats expense and tracker from the
 * app name on purpose: the pooled index could already form the phrase from the
 * two fields separately, but having it whole in one field is what ranks for it.
 */
/** @type {Record<string, string>} */
export const IOS_SUBTITLES = {
  en: 'Offline expense tracker',
  zh: '离线记账应用',
  de: 'Offline-Ausgaben-Tracker',
  fr: 'Suivi de dépenses hors ligne',
  es: 'Control de gastos offline',
  pt: 'Controle de gastos offline',
  it: 'App spese offline',
  nl: 'Offline uitgaven-tracker',
  ru: 'Офлайн-учёт расходов',
  ja: 'オフライン家計簿',
  ko: '오프라인 가계부',
  hi: 'ऑफलाइन खर्च ट्रैकर',
  id: 'Pelacak pengeluaran offline',
  tr: 'Çevrimdışı gider takibi',
  vi: 'Theo dõi chi tiêu ngoại tuyến',
  th: 'แอปบันทึกรายจ่ายออฟไลน์',
  pl: 'Śledzenie wydatków offline',
  uk: 'Офлайн-облік витрат',
  sv: 'Utgiftsapp offline',
  nb: 'Utgiftsapp offline',
  da: 'Udgiftsapp offline',
  ms: 'Penjejak perbelanjaan offline',
};

/**
 * Play's short description, 80 characters. Play has no keyword field, so this
 * is the one indexed line it gets, and it shows under the title on the listing.
 * Every locale is written here. They used to inherit the English line, which
 * left an English tagline on the German and Thai listings.
 */
/** @type {Record<string, string>} */
export const PLAY_SHORT_DESCRIPTIONS = {
  en: 'Offline expense tracker. See what your spending costs in hours of work.',
  zh: '离线记账应用。看清每一笔消费花掉你多少小时。',
  de: 'Offline-Ausgaben-Tracker. Sieh, wie viele Arbeitsstunden dein Geld kostet.',
  fr: 'Suivi de dépenses hors ligne. Voyez vos achats en heures de travail.',
  es: 'Control de gastos offline. Mira lo que gastas en horas de trabajo.',
  pt: 'Controle de gastos offline. Veja seus gastos em horas de trabalho.',
  it: 'App spese offline. Guarda quanto costano le tue spese in ore di lavoro.',
  nl: 'Offline uitgaven-tracker. Zie wat je uitgaven kosten in werkuren.',
  ru: 'Офлайн-учёт расходов. Смотрите, во сколько часов работы обходятся траты.',
  ja: 'オフライン家計簿。支出が何時間の労働にあたるかがわかります。',
  ko: '오프라인 가계부. 지출이 몇 시간의 노동인지 보여줍니다.',
  hi: 'ऑफलाइन खर्च ट्रैकर। देखें कि आपका खर्च कितने घंटों के काम के बराबर है।',
  id: 'Pelacak pengeluaran offline. Lihat belanja Anda dalam jam kerja.',
  tr: 'Çevrimdışı gider takibi. Harcamalarınızın kaç saatlik iş olduğunu görün.',
  vi: 'Theo dõi chi tiêu ngoại tuyến. Xem chi tiêu của bạn bằng số giờ làm việc.',
  th: 'แอปบันทึกรายจ่ายออฟไลน์ ดูว่ารายจ่ายของคุณเท่ากับการทำงานกี่ชั่วโมง',
  pl: 'Śledzenie wydatków offline. Zobacz swoje wydatki w godzinach pracy.',
  uk: 'Офлайн-облік витрат. Дивіться свої витрати в годинах роботи.',
  sv: 'Utgiftsapp offline. Se vad dina utgifter kostar i arbetstimmar.',
  nb: 'Utgiftsapp offline. Se hva utgiftene dine koster i arbeidstimer.',
  da: 'Udgiftsapp offline. Se hvad dine udgifter koster i arbejdstimer.',
  ms: 'Penjejak perbelanjaan offline. Lihat belanja anda dalam jam kerja.',
};

/**
 * The iOS keyword field: 100 characters per locale, comma separated, no spaces
 * after the commas. Apple searches name + subtitle + keywords as one pool, so
 * nothing here repeats a word from either. This is where receipts, scanning and
 * budgeting are indexed, which is why the listing copy never has to name them.
 *
 * Chinese is the exception to "never repeat": a search is one unspaced string,
 * and an exact compound in the field (记账本) ranks well above the same words
 * assembled from the subtitle and the field (in Singapore in 2026-11, 记账本 was
 * #29 and 记账 alone #87). So the common compounds are listed whole.
 *
 * @type {Record<string, string>}
 */
export const IOS_KEYWORDS = {
  en: 'budget,receipts,scan,spending,money,finance,bills,subscriptions,savings,hourly,wage,manager,planner',
  zh: '预算,收据,扫描,支出,消费,理财,交易,时薪,储蓄,账单,订阅,省钱,分析,账本,记账本,消费记录,理财规划,记账软件,花销,开销,存钱,攒钱,小票,工资,自动记账,拍照记账,语音记账,发票,收支',
  de: 'budget,belege,scannen,kosten,finanzen,haushaltsbuch,geld,stundensatz,sparen,abo,rechnung',
  fr: 'budget,recu,scan,finance,argent,transaction,horaire,taux,epargne,abonnement,facture',
  es: 'presupuesto,recibo,escanear,finanzas,dinero,transaccion,hora,tarifa,ahorro,suscripcion,factura',
  pt: 'orcamento,recibo,escanear,financas,dinheiro,transacao,hora,taxa,poupanca,assinatura,conta',
  it: 'budget,scontrino,scansione,contabilita,finanza,soldi,transazione,orario,tariffa,risparmio',
  nl: 'budget,bon,scannen,huishoudboekje,financien,geld,transactie,uurloon,sparen,abonnement',
  ru: 'бюджет,чек,сканер,траты,финансы,деньги,транзакции,ставка,сбережения,подписки,счета',
  ja: '予算,レシート,スキャン,支出,出費,節約,財務,取引,時給,貯金,サブスク,請求,分析,お金,家計管理,支出管理,節約術',
  ko: '예산,영수증,스캔,지출,소비,절약,재정,거래,시급,저축,구독,청구서,분석,돈,가계부앱,소비관리,자산관리',
  hi: 'बजट,रसीद,स्कैन,वित्त,पैसा,लेनदेन,घंटा,दर,बचत,सदस्यता,बिल,विश्लेषण,बजट प्लानर',
  id: 'anggaran,struk,scan,belanja,keuangan,uang,transaksi,jam,tarif,tabungan,langganan,tagihan',
  tr: 'butce,fis,tarama,harcama,finans,para,islem,saatlik,tasarruf,abonelik,fatura,analiz',
  vi: 'ngân sách,hóa đơn,quét,tài chính,tiền,giao dịch,giờ,lương,tiết kiệm,đăng ký,quản lý tiền',
  th: 'งบประมาณ,ใบเสร็จ,สแกน,การใช้จ่าย,การเงิน,เงิน,ธุรกรรม,รายชั่วโมง,ออม,บิล,วางแผนการเงิน',
  pl: 'budzet,paragon,skan,finanse,pieniadze,transakcje,godzina,stawka,oszczednosci,subskrypcje',
  uk: 'бюджет,чек,сканер,фінанси,гроші,транзакції,години,ставка,заощадження,підписки,рахунки',
  sv: 'budget,kvitto,skanna,ekonomi,pengar,transaktion,timlon,sparande,prenumeration,rakningar',
  nb: 'budsjett,kvittering,skanne,forbruk,okonomi,penger,transaksjon,timelonn,sparing,abonnement',
  da: 'budget,kvittering,scanne,forbrug,okonomi,penge,transaktion,timelon,opsparing,abonnement',
  // Malaysia's App Store indexes only English (U.K.) and Malay, so this field is
  // where Chinese searches in Malaysia (记账, 记账本 …) can find the app at all:
  // the zh-Hans keywords never reach that storefront. Almost nobody's phone is
  // set to Malay (under 0.2% of Malaysian users), so the field is spent mostly on
  // Chinese, with the Malay terms people do type kept at the end.
  ms: '记账,记账本,记账软件,账本,花销,开销,支出,消费,存钱,攒钱,省钱,预算,理财,时薪,工资,收据,小票,储蓄,自动记账,拍照记账,bajet,belanja,duit,resit,kewangan',
};

/**
 * Copy for one store locale that differs from its App Studio language's.
 *
 * One App Studio language feeds several store locales (`storeLocales.mjs`), and
 * the copy is identical for all of them unless a store locale is listed here.
 * The case it exists for is Chinese: `zh` goes to Simplified and Traditional
 * Chinese alike, and a Traditional Chinese storefront (Taiwan, Hong Kong,
 * Macao) searches in Traditional characters, so Simplified keywords there match
 * nothing. Only the short fields are here; the descriptions stay Simplified.
 *
 * Keyed by App Studio language, then store locale.
 *
 * @type {Record<string, Record<string, {subtitle?: string, keywords?: string}>>}
 */
export const IOS_STORE_LOCALE_COPY = {
  zh: {
    'zh-Hant': {
      subtitle: '離線記帳應用',
      keywords: '預算,收據,掃描,支出,消費,理財,時薪,儲蓄,帳單,訂閱,省錢,分析,帳本,記帳本,記帳軟體,記賬,消費紀錄,花費,開銷,存錢,工資,薪水,發票,自動記帳,拍照記帳,語音記帳,收支,帳務,記錄',
    },
  },
};

/**
 * The same for Play, whose `zh` language feeds zh-CN, zh-TW and zh-HK. Only the
 * short description (sent as `subtitle`) is overridden.
 *
 * @type {Record<string, Record<string, {subtitle?: string}>>}
 */
export const PLAY_STORE_LOCALE_COPY = {
  zh: {
    'zh-TW': { subtitle: '離線記帳應用。看清每一筆消費花掉你多少小時。' },
    'zh-HK': { subtitle: '離線記帳應用。看清每一筆消費花掉你多少小時。' },
  },
};

/**
 * The copy to write to one store locale: the App Studio language's copy with
 * that store locale's overrides on top. `copy.storeLocales` carries the
 * overrides in an upload request, keyed by store locale.
 *
 * @template {{storeLocales?: Record<string, object>}} T
 * @param {T} copy
 * @param {string} storeLocale
 * @returns {Omit<T, 'storeLocales'>}
 */
export function copyForStoreLocale(copy, storeLocale) {
  const { storeLocales, ...rest } = copy;
  return { ...rest, ...(storeLocales?.[storeLocale] ?? {}) };
}
