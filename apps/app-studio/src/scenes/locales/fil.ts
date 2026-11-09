import type { LocaleModule } from './types';

/**
 * Filipino — translation of the English source. Numeric / currency / date tokens
 * are reused verbatim from English because every locale renders on top of the
 * English screenshots (the US-dollar amounts and English dates are baked in).
 * Common English finance/UI terms are kept (natural Filipino code-switching).
 */
const fil: LocaleModule = {
  meta: { code: 'fil', flag: '🇵🇭', label: 'Filipino' },

  phone: {
    s1:  { h: 'Bawat Linya,\nsa Oras.', hl: 'sa Oras.', sh: 'Pera at oras ang wika ng ledger mo', she: '⏳', price: '$10.10', time: '23m', timeSub: 'trabaho' },
    s2:  { h: 'Lahat ng Pera.\nIsang Lugar.', hl: 'Isang Lugar.', sh: 'Yaman, ipon, credit — nakikita lahat', she: '💚', netWorth: '$55,931', netWorthLabel: 'Net Worth', checking: 'Daily Checking', checkingSub: 'Araw-araw', checkingValue: '$31,079', savings: 'High Yield Savings', savingsSub: 'Mga Layunin', savingsValue: '$15,004' },
    s3:  { h: 'Bawat Araw\nsa Isang Tingin', hl: 'sa Isang Tingin', sh: 'Visual na kalendaryo ng gastos mo', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Gastos ngayon', amount: '$76.55', food: 'Pagkain', shopping: 'Shopping', transport: 'Biyahe' },
    s4:  { h: 'Saan Napupunta\nang Pera Mo?', hl: 'ang Pera Mo?', sh: 'Magagandang chart, hati-hati lahat', she: '🥧', home: 'Bahay  59%', travel: 'Pagkain  22%', food: 'Biyahe  9%', total: 'Kabuuang Gastos', totalValue: '$2,899.22' },
    s5:  { h: 'Bawat Dolyar\nay Oras Mo', hl: 'Oras Mo', sh: 'Tingnan kung gaano katagal ka nagtrabaho', she: '⏰', time: '112h 24m', timeLabel: 'ngayong buwan', money: '$2,899.22' },
    s6:  { h: 'Ano ang\nIpon Mo?', hl: 'Ipon Mo?', sh: 'I-track buwan-buwan. Gawing ugali', she: '📊', healthy: '20%+ ay healthy', income: 'Kita', expense: 'Gastos', saved: 'Naipon' },
    s7:  { h: 'I-record\nsa Segundo', hl: 'sa Segundo', sh: 'Mabilis na entry mula sa home screen', she: '⚡', saved: 'Na-save!', quick: 'Dagdag', mood: '~15m trabaho' },
    s8:  { h: 'Hatiin\nang Bill', hl: 'ang Bill', sh: 'Hatiin ang bill, mood, notes — bahala ka', she: '✍️', splitBill: 'Hati ng Bill', mood: 'Mood', note: 'Notes' },
    s9:  { h: 'Magkano Talaga\nKita Mo?', hl: 'Kita Mo?', sh: 'Hourly rate kada buwan, laging updated', she: '💡', rate: '$25.79', perHour: 'kada oras', revealed: 'Bagong rate', current: 'May 2026 — ngayon' },
    s10: { h: 'Subscriptions\nKontrolado', hl: 'Kontrolado', sh: 'Upa, membership, mga regular na bill', she: '🔁', total: '$1,556.99 / buwan', rent: 'Upa sa Bahay', gym: 'Gym Membership', streaming: 'Streaming Bundle' },
    s11: { h: 'Gawing\nIyo', hl: 'Iyo', sh: 'I-personalize ang bawat sulok ng app', she: '⚙️', display: 'Display', hourly: 'Halaga kada oras', categories: 'Categories' },
    s12: { h: 'Piliin ang\nVibe Mo', hl: 'Vibe Mo', sh: 'Wika, currency, at tema — sa gusto mo', she: '🎨', language: 'Filipino (fil)', currency: 'USD ($)', theme: 'Maliwanag · Sage' },
    s13: { h: 'Import\nsa Isang Tap', hl: 'sa Isang Tap', sh: 'Binabasa ng AI ang statement. Ikaw ang kumpirma', she: '🤖', aiPowered: 'May AI', oneTap: 'Copy Prompt', pasteJSON: 'Paste JSON' },
    s14: { h: 'I-type.\nI-tap. Tapos.', hl: 'Tapos.', sh: 'Ang keyboard ang pinakamabilis na paraan', she: '⌨️', type: 'Kape 6.50', tap: '↵', done: '0m i-log', category: 'Auto · Pagkain / Kape' },
    s16: { h: 'Magbudget.\nSundin Mo Ito.', hl: 'Sundin Mo Ito.', sh: 'Bawat kategorya, laging nakikita', she: '🎯', ring: '80%', left: '$730.85 ang natitira', budgeted: 'Nakabudget na gastos', unbudgeted: 'Hindi nakabudget' },
    s15: {
      privacy: 'Privacy muna', privacySub: 'Hindi umaalis sa phone mo ang data',
      heroSub: 'Nananatili ang iyong data sa iyong device. Noon pa man, at magpakailanman.',
      noAds: 'Walang ads', noAdsSub: 'Walang abala. Puro pananalapi mo lang.',
      local: 'Ganap na lokal', localSub: 'Gumagana offline. Hindi kailangan ng account',
      inspiredPre: 'Hango sa',
      bookSub: 'Ang pera ay ang lakas ng buhay na ipinagpalit mo',
      bookDesc: 'Ang walang-kupas na gabay sa personal na pananalapi. Praktikal na karunungan sa pera, oras, at buhay.',
      downloads: '50,000+ na user',
    },
  },

  feature: {
    titleA: 'Bawat dolyar na ginagastos mo',
    titleB: { pre: 'ay ', hl: 'oras', post: ' ng buhay mo.' },
    sub: 'Tingnan ang totoong hourly rate mo',
  },

  landing: {
    titleA: 'Ang $5 mong kape, katumbas ng',
    titleB: '12 minuto ng buhay.',
    subtitle: 'Tingnan ang totoong presyo sa oras ng bawat bili.',
  },
};

export default fil;
