import type { LocaleModule } from './types';

/**
 * Swedish — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const sv: LocaleModule = {
  meta: { code: 'sv', flag: '🇸🇪', label: 'Svenska' },

  phone: {
    s1:  { h: 'Varje Rad,\ni Timmar.', hl: 'i Timmar.', sh: 'Din kassabok talar pengar och tid', she: '⏳', price: '$10.10', time: '23m', timeSub: 'arbete' },
    s2:  { h: 'Alla Pengar.\nEtt Ställe.', hl: 'Ett Ställe.', sh: 'Förmögenhet, sparande, kredit — i sikte', she: '💚', netWorth: '$55,931', netWorthLabel: 'Förmögenhet', checking: 'Lönekonto', checkingSub: 'Vardag', checkingValue: '$31,079', savings: 'Sparkonto Ränta', savingsSub: 'Mål', savingsValue: '$15,004' },
    s3:  { h: 'Se Varje Dag\npå en Sekund', hl: 'på en Sekund', sh: 'Visuell kalender över dina utgifter', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Spent idag', amount: '$76.55', food: 'Mat', shopping: 'Shopping', transport: 'Resor' },
    s4:  { h: 'Vart Tar\nPengarna Vägen?', hl: 'Pengarna Vägen?', sh: 'Tydliga diagram bryter ner allt', she: '🥧', home: 'Hem  59%', travel: 'Mat  22%', food: 'Resor  9%', total: 'Total Utgift', totalValue: '$2,899.22' },
    s5:  { h: 'Varje Krona\när Din Tid', hl: 'Din Tid', sh: 'Se exakt hur länge du jobbat för den', she: '⏰', time: '112h 24m', timeLabel: 'denna månad', money: '$2,899.22' },
    s6:  { h: 'Hur Mycket\nSparar Du?', hl: 'Sparar Du?', sh: 'Följ varje månad. Bygg vanan', she: '📊', healthy: '20%+ är sunt', income: 'Inkomst', expense: 'Utgift', saved: 'Sparat' },
    s7:  { h: 'Bokför Utgift\npå Sekunder', hl: 'på Sekunder', sh: 'Snabb inmatning från startskärmen', she: '⚡', saved: 'Sparat!', quick: 'Lägg till', mood: '~15m arbete' },
    s8:  { h: 'Dela\nNotan', hl: 'Notan', sh: 'Dela nota, humör, anteckningar — du väljer', she: '✍️', splitBill: 'Dela Nota', mood: 'Humör', note: 'Noter' },
    s9:  { h: 'Vad Tjänar\nDu Egentligen?', hl: 'Du Egentligen?', sh: 'Timlön per månad, alltid uppdaterad', she: '💡', rate: '$25.79', perHour: 'per timme', revealed: 'Senaste lön', current: 'May 2026 — aktuell' },
    s10: { h: 'Prenumerationer\nUnder Kontroll', hl: 'Under Kontroll', sh: 'Hyra, medlemskap, återkommande räkningar', she: '🔁', total: '$1,556.99 / mån', rent: 'Lägenhetshyra', gym: 'Gymkort', streaming: 'Streamingpaket' },
    s11: { h: 'Gör Den\nTill Din', hl: 'Till Din', sh: 'Anpassa varje hörn av appen', she: '⚙️', display: 'Visning', hourly: 'Timvärde', categories: 'Kategorier' },
    s12: { h: 'Välj Din\nStil', hl: 'Stil', sh: 'Språk, valuta och tema — som du vill', she: '🎨', language: 'Svenska (sv)', currency: 'USD ($)', theme: 'Ljust · Salvia' },
    s13: { h: 'Importera\nmed Ett Tryck', hl: 'med Ett Tryck', sh: 'AI läser ditt utdrag. Du bekräftar', she: '🤖', aiPowered: 'Med AI', oneTap: 'Kopiera Text', pasteJSON: 'Klistra JSON' },
    s14: { h: 'Skriv.\nTryck. Klart.', hl: 'Klart.', sh: 'Tangentbordet är snabbaste vägen in', she: '⌨️', type: 'Kaffe 6.50', tap: '↵', done: '0m att föra in', category: 'Auto · Mat / Kaffe' },
    s15: {
      h: 'Din data\nförblir din.', hl: 'förblir din.',
      privacy: 'Integritet inbyggd', privacySub: 'Sparas på din telefon. Synk är valfritt.',
      noAds: 'Inga annonser', noAdsSub: 'Inga distraktioner. Bara din ekonomi.',
      local: 'Lokalt först', localSub: 'Fungerar offline. Inget konto behövs.',
      users: '70 000+ användare',
      inspiredPre: 'Inspirerad av',
      bookSub: 'Pengar är den livsenergi du byter bort för dem',
      bookDesc: 'Den tidlösa klassikern om privatekonomi. Praktisk visdom om pengar, tid och liv.',
    },
    s16: { h: 'Sätt en Budget.\nHåll Kursen.', hl: 'Håll Kursen.', sh: 'Varje kategori, alltid i sikte', she: '🎯', ring: '80%', left: '$730.85 kvar', budgeted: 'Budgeterade utgifter', unbudgeted: 'Ej budgeterat' },
  },

  feature: {
    titleA: 'Varje krona du spenderar',
    titleB: { pre: 'är ', hl: 'timmar', post: ' av ditt liv.' },
    sub: 'Se din verkliga timlön',
  },

  landing: {
    titleA: 'Din kaffe för $5 kostade just',
    titleB: '12 minuter av livet.',
    subtitle: 'Se det verkliga tidspriset på varje köp.',
  },
};

export default sv;
