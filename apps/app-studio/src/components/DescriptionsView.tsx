'use client';

import { useEffect, useState } from 'react';
import { APP_DESCRIPTIONS, DESCRIPTION_LOCALE_CODES } from '../data/appDescriptions';
import { LOCALE_META } from '../scenes/locales';

type UploadPlatform = 'ios' | 'android';
type LogType = 'info' | 'success' | 'error';

interface LogLine { text: string; type: LogType }

interface IOSMetadata {
  name: string;
  subtitle: string;
  privacyPolicyUrl: string;
  privacyChoicesUrl: string;
  privacyPolicyText: string;
  keywords: string;
  supportUrl: string;
  marketingUrl: string;
  whatsNew: string;
}

/**
 * The one name the app goes by, on both stores and in every locale. Play let a
 * localized zh-CN title in at some point; sending this for every locale is what
 * takes it back out.
 */
const APP_NAME = 'Money2Time: Expense Tracker';
const IOS_PRIVACY_POLICY_URL = 'https://money2time.com/privacy';
const IOS_PRIVACY_CHOICES_URL = IOS_PRIVACY_POLICY_URL;
const IOS_SUPPORT_URL = 'https://www.money2time.com/';
const IOS_MARKETING_URL = 'https://www.money2time.com/';

/**
 * The iOS subtitle, 30 characters. It says the category plainly, because that
 * is the phrase people actually type. It repeats expense and tracker from the
 * app name on purpose: the pooled index could already form the phrase from the
 * two fields separately, but having it whole in one field is what ranks for it.
 */
const IOS_SUBTITLES: Record<string, string> = {
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
const PLAY_SHORT_DESCRIPTIONS: Record<string, string> = {
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
 */
const IOS_KEYWORDS: Record<string, string> = {
  en: 'budget,receipts,scan,spending,money,finance,bills,subscriptions,savings,hourly,wage,manager,planner',
  zh: '预算,收据,扫描,支出,消费,理财,交易,时薪,储蓄,账单,订阅,省钱,分析,账本,记账本,消费记录,理财规划,时间管理',
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
  ms: 'bajet,resit,imbas,belanja,kewangan,duit,transaksi,jam,kadar,simpanan,langganan,bil',
};


function getPrivacyPolicyText(description: string): string {
  return description
    .split('\n')
    .find(line => line.includes(IOS_PRIVACY_POLICY_URL))
    ?? `Privacy Policy: ${IOS_PRIVACY_POLICY_URL}`;
}

function buildDefaultIOSMetadata(): Record<string, IOSMetadata> {
  return Object.fromEntries(DESCRIPTION_LOCALE_CODES.map((locale) => {
    const description = APP_DESCRIPTIONS[locale].description;
    return [locale, {
      name: APP_NAME,
      subtitle: IOS_SUBTITLES[locale] ?? IOS_SUBTITLES.en,
      privacyPolicyUrl: IOS_PRIVACY_POLICY_URL,
      privacyChoicesUrl: IOS_PRIVACY_CHOICES_URL,
      privacyPolicyText: getPrivacyPolicyText(description),
      keywords: IOS_KEYWORDS[locale] ?? IOS_KEYWORDS.en,
      supportUrl: IOS_SUPPORT_URL,
      marketingUrl: IOS_MARKETING_URL,
      whatsNew: APP_DESCRIPTIONS[locale].whatsNew ?? APP_DESCRIPTIONS.en.whatsNew ?? '',
    }];
  }));
}

const DEFAULT_IOS_METADATA = buildDefaultIOSMetadata();

interface PlayTrack {
  track: string;
  releases: Array<{ name?: string; status?: string; versionCodes: string[] }>;
}

export function DescriptionsView() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingWhatsNew, setUploadingWhatsNew] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [iosMetadata, setIOSMetadata] = useState<Record<string, IOSMetadata>>(DEFAULT_IOS_METADATA);

  /**
   * Play keeps a release note on a release inside a track rather than on the
   * listing, so it needs a track chosen before it can take one. Only tracks
   * that already have a release can hold one.
   */
  const [tracks, setTracks] = useState<PlayTrack[]>([]);
  const [track, setTrack] = useState<string>('');

  useEffect(() => {
    fetch('/api/upload/android/whats-new')
      .then(r => r.json())
      .then((body) => {
        const list: PlayTrack[] = body.tracks ?? [];
        setTracks(list);
        setTrack(prev => prev || list[0]?.track || '');
      })
      .catch(() => {});
  }, []);

  const addLog = (text: string, type: LogType = 'info') =>
    setLog(prev => [...prev, { text, type }]);

  const updateIOSField = (locale: string, field: keyof IOSMetadata, value: string) => {
    setIOSMetadata(prev => ({
      ...prev,
      [locale]: {
        ...(prev[locale] ?? DEFAULT_IOS_METADATA[locale]),
        [field]: value,
      },
    }));
  };

  const resetIOSMetadata = (locale: string) => {
    setIOSMetadata(prev => ({ ...prev, [locale]: DEFAULT_IOS_METADATA[locale] }));
  };

  const handleUploadWhatsNew = async (platform: UploadPlatform) => {
    if (uploadingWhatsNew) return;
    if (platform === 'android' && !track) {
      setLog([{ text: 'No Play track has a release to write notes on.', type: 'error' }]);
      return;
    }
    setUploadingWhatsNew(true);
    setLog([]);

    const localizations: Record<string, { whatsNew: string }> = {};
    for (const locale of DESCRIPTION_LOCALE_CODES) {
      const ios = iosMetadata[locale] ?? DEFAULT_IOS_METADATA[locale];
      localizations[locale] = { whatsNew: ios.whatsNew };
    }

    const where = platform === 'ios' ? 'App Store Connect' : `Google Play, ${track} track`;
    addLog(`Uploading What's New to ${where} (${DESCRIPTION_LOCALE_CODES.length} locales)…`);

    // Play's release note is not a listing field, so it has its own endpoint.
    const endpoint = platform === 'ios'
      ? '/api/upload/ios/descriptions'
      : '/api/upload/android/whats-new';

    try {
      const res  = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(platform === 'ios' ? { localizations } : { localizations, track }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      for (const n of (body.notes ?? []) as string[]) addLog(`· ${n}`, 'info');
      const count = Object.keys(body.updated ?? {}).length;
      addLog(
        count ? `✓ Done — ${count} locales updated` : 'Nothing was written',
        count ? 'success' : 'error',
      );
      for (const e of (body.errors ?? []) as string[]) addLog(`⚠ ${e}`, 'error');
    } catch (err) {
      addLog(`✗ ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setUploadingWhatsNew(false);
    }
  };

  const handleUpload = async (platform: UploadPlatform) => {
    if (uploading) return;
    setUploading(true);
    setLog([]);

    // Build payload from hard-coded descriptions
    const localizations: Record<string, {
      name?: string;
      subtitle?: string;
      privacyPolicyUrl?: string;
      privacyChoicesUrl?: string;
      privacyPolicyText?: string;
      keywords?: string;
      supportUrl?: string;
      marketingUrl?: string;
      whatsNew?: string;
      description: string;
    }> = {};
    for (const locale of DESCRIPTION_LOCALE_CODES) {
      const description = APP_DESCRIPTIONS[locale].description;
      const ios = iosMetadata[locale] ?? DEFAULT_IOS_METADATA[locale];
      localizations[locale] = {
        description,
        name: platform === 'ios' ? ios.name : APP_NAME,
        subtitle: platform === 'ios' ? ios.subtitle : PLAY_SHORT_DESCRIPTIONS[locale],
        ...(platform === 'ios' ? {
          privacyPolicyUrl: ios.privacyPolicyUrl,
          privacyChoicesUrl: ios.privacyChoicesUrl,
          privacyPolicyText: ios.privacyPolicyText,
          keywords: ios.keywords,
          supportUrl: ios.supportUrl,
          marketingUrl: ios.marketingUrl,
          whatsNew: ios.whatsNew,
        } : {}),
      };
    }

    addLog(`Uploading ${DESCRIPTION_LOCALE_CODES.length} descriptions to ${platform === 'ios' ? 'App Store Connect' : 'Google Play'}…`);

    const endpoint = platform === 'ios'
      ? '/api/upload/ios/descriptions'
      : '/api/upload/android/descriptions';

    try {
      const res  = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localizations }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      for (const n of (body.notes ?? []) as string[]) addLog(`· ${n}`, 'info');
      const count = Object.keys(body.updated ?? {}).length;
      addLog(
        count ? `✓ Done — ${count} locales updated` : 'Nothing was written',
        count ? 'success' : 'error',
      );
      for (const e of (body.errors ?? []) as string[]) addLog(`⚠ ${e}`, 'error');
    } catch (err) {
      addLog(`✗ ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-[860px] mx-auto px-8 py-10">

      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h2 className="text-[18px] font-semibold text-white">App Descriptions</h2>
          <p className="text-[12px] text-white/35 mt-1">
            {DESCRIPTION_LOCALE_CODES.length} locales · hard-coded · click any to expand
          </p>
        </div>

        {/* Upload buttons */}
        <div className="flex flex-col items-end gap-2">
          {/* What's New only */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mr-1">
              What's New only
            </span>
            {tracks.length > 0 && (
              <select
                value={track}
                onChange={e => setTrack(e.target.value)}
                disabled={uploading || uploadingWhatsNew}
                title="Play writes the release note onto every release in this track"
                className="h-8 px-2 rounded-lg text-[11px] font-medium cursor-pointer
                  bg-[#080810] border border-white/[0.08] text-white/60
                  outline-none focus:border-[#10b981]/50 disabled:opacity-40"
              >
                {tracks.map(t => (
                  <option key={t.track} value={t.track}>
                    {t.track} · {t.releases.map(r => r.name).filter(Boolean).join(', ') || 'release'}
                  </option>
                ))}
              </select>
            )}
            {(['ios', 'android'] as UploadPlatform[]).map(p => (
              <button
                key={p}
                onClick={() => handleUploadWhatsNew(p)}
                disabled={uploading || uploadingWhatsNew || (p === 'android' && !track)}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold
                  transition-all cursor-pointer border border-[#10b981]/25
                  bg-[#10b981]/[0.07] hover:bg-[#10b981]/[0.14] text-[#10b981]/80 hover:text-[#10b981]
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p === 'ios'
                  ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  : <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-1.44-.5-3.08-.77-4.87-.77-1.79 0-3.43.27-4.87.77L4.85 5.67c-.18-.28-.54-.37-.83-.22-.29.16-.42.54-.26.85l1.84 3.18C2.63 11.46 1 14.3 1 17.5h22c0-3.2-1.63-6.04-5.4-8.02zm-9.1 4.52c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1zm7 0c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1z"/></svg>
                }
                {uploadingWhatsNew ? 'Uploading…' : p === 'ios' ? 'App Store' : 'Play Store'}
              </button>
            ))}
          </div>

          {/* Full upload */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25 mr-1">
              Full upload
            </span>
            {(['ios', 'android'] as UploadPlatform[]).map(p => (
              <button
                key={p}
                onClick={() => handleUpload(p)}
                disabled={uploading || uploadingWhatsNew}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-[12px] font-semibold
                  transition-all cursor-pointer border border-white/[0.08]
                  bg-white/[0.05] hover:bg-white/[0.10] text-white/70 hover:text-white
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {p === 'ios'
                  ? <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                  : <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-1.44-.5-3.08-.77-4.87-.77-1.79 0-3.43.27-4.87.77L4.85 5.67c-.18-.28-.54-.37-.83-.22-.29.16-.42.54-.26.85l1.84 3.18C2.63 11.46 1 14.3 1 17.5h22c0-3.2-1.63-6.04-5.4-8.02zm-9.1 4.52c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1zm7 0c-.56 0-1-.45-1-1s.44-1 1-1 1 .45 1 1-.44 1-1 1z"/></svg>
                }
                {uploading ? 'Uploading…' : p === 'ios' ? 'App Store' : 'Play Store'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Upload log */}
      {log.length > 0 && (
        <div className="mb-6 bg-[#080810] rounded-2xl border border-white/[0.06] p-4 font-mono text-[12px] flex flex-col gap-1">
          {log.map((l, i) => (
            <span key={i} className={
              l.type === 'success' ? 'text-[#34d399]'
              : l.type === 'error' ? 'text-red-400'
              : 'text-white/50'
            }>{l.text}</span>
          ))}
        </div>
      )}

      {/* Locale list */}
      <div className="flex flex-col gap-2">
        {DESCRIPTION_LOCALE_CODES.map(locale => {
          const meta = LOCALE_META[locale];
          const desc = APP_DESCRIPTIONS[locale].description;
          const ios = iosMetadata[locale] ?? DEFAULT_IOS_METADATA[locale];
          const isOpen = expanded === locale;
          const inputClass = `w-full rounded-lg border border-white/[0.08] bg-[#080810] px-3 py-2 text-[12px]
            text-white/75 outline-none transition-colors focus:border-[#10b981]/50 focus:bg-[#0b0b15]`;
          const labelClass = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30';
          const textareaClass = `${inputClass} min-h-[112px] resize-y leading-relaxed`;

          return (
            <div
              key={locale}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden"
            >
              <button
                onClick={() => setExpanded(isOpen ? null : locale)}
                className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-white/[0.03] transition-all cursor-pointer"
              >
                <span className="text-[20px] leading-none shrink-0">{meta?.flag}</span>
                <span className="text-[13px] font-medium text-white/80 w-32 shrink-0">
                  {meta?.label}
                  {meta?.badge && <span className="ml-1.5 text-[10px] text-white/30">{meta.badge}</span>}
                </span>
                <span className="font-mono text-[11px] text-white/25 w-10 shrink-0">{locale}</span>
                <span className="flex-1 text-[12px] text-white/35 truncate">{desc.slice(0, 90)}…</span>
                <svg
                  className={`w-4 h-4 text-white/25 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isOpen && (
                <div className="px-5 pb-5 border-t border-white/[0.05] pt-4 flex flex-col gap-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[12px] font-semibold text-white/55">App Description</h3>
                      <span className="text-[10px] text-white/25">read-only</span>
                    </div>
                    <pre className="text-[13px] text-white/65 whitespace-pre-wrap leading-relaxed font-sans">
                      {desc}
                    </pre>
                  </div>

                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-[12px] font-semibold text-white/70">iOS Metadata</h3>
                        <p className="text-[11px] text-white/30 mt-0.5">
                          Saved locally and used by Upload to App Store.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => resetIOSMetadata(locale)}
                        className="h-8 px-3 rounded-lg border border-white/[0.08] text-[11px] text-white/45
                          hover:text-white/75 hover:bg-white/[0.05] transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>Name</span>
                        <input
                          value={ios.name}
                          onChange={e => updateIOSField(locale, 'name', e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="flex items-center justify-between">
                          <span className={labelClass}>Subtitle</span>
                          <span className={`text-[10px] ${ios.subtitle.length > 30 ? 'text-red-400' : 'text-white/25'}`}>
                            {ios.subtitle.length}/30
                          </span>
                        </span>
                        <input
                          value={ios.subtitle}
                          onChange={e => updateIOSField(locale, 'subtitle', e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>Support URL</span>
                        <input
                          value={ios.supportUrl}
                          onChange={e => updateIOSField(locale, 'supportUrl', e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>Marketing URL</span>
                        <input
                          value={ios.marketingUrl}
                          onChange={e => updateIOSField(locale, 'marketingUrl', e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>Privacy Policy URL</span>
                        <input
                          value={ios.privacyPolicyUrl}
                          onChange={e => updateIOSField(locale, 'privacyPolicyUrl', e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className={labelClass}>User Privacy Choices URL</span>
                        <input
                          value={ios.privacyChoicesUrl}
                          onChange={e => updateIOSField(locale, 'privacyChoicesUrl', e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="col-span-2 flex flex-col gap-1.5">
                        <span className="flex items-center justify-between">
                          <span className={labelClass}>Keywords</span>
                          <span className={`text-[10px] ${ios.keywords.length > 100 ? 'text-red-400' : 'text-white/25'}`}>
                            {ios.keywords.length}/100
                          </span>
                        </span>
                        <input
                          value={ios.keywords}
                          onChange={e => updateIOSField(locale, 'keywords', e.target.value)}
                          className={inputClass}
                        />
                      </label>

                      <label className="col-span-2 flex flex-col gap-1.5">
                        <span className={labelClass}>What's New in This Version</span>
                        <textarea
                          value={ios.whatsNew}
                          onChange={e => updateIOSField(locale, 'whatsNew', e.target.value)}
                          className={textareaClass}
                        />
                      </label>

                      <label className="col-span-2 flex flex-col gap-1.5">
                        <span className={labelClass}>Apple TV Privacy Policy</span>
                        <textarea
                          value={ios.privacyPolicyText}
                          onChange={e => updateIOSField(locale, 'privacyPolicyText', e.target.value)}
                          className={`${textareaClass} min-h-[72px]`}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
