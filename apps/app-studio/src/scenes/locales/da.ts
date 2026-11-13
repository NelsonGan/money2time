import type { LocaleModule } from './types';

/**
 * Danish — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const da: LocaleModule = {
  meta: { code: 'da', flag: '🇩🇰', label: 'Dansk' },

  phone: {
    s1:  { h: 'Hver Linje,\ni Timer.', hl: 'i Timer.', sh: 'Dit regnskab taler penge og tid', she: '⏳', price: '$10.10', time: '23m', timeSub: 'arbejde' },
    s2:  { h: 'Alle Penge.\nÉt Sted.', hl: 'Ét Sted.', sh: 'Formue, opsparing, kredit — i overblik', she: '💚', netWorth: '$55,931', netWorthLabel: 'Formue', checking: 'Daglig Konto', checkingSub: 'Hverdag', checkingValue: '$31,079', savings: 'Højrente Opsparing', savingsSub: 'Mål', savingsValue: '$15,004' },
    s3:  { h: 'Se Hver Dag\nMed Ét Blik', hl: 'Med Ét Blik', sh: 'Visuel kalender over dit forbrug', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Brugt i dag', amount: '$76.55', food: 'Mad', shopping: 'Shopping', transport: 'Transport' },
    s4:  { h: 'Hvor Ryger\nPengene Hen?', hl: 'Pengene Hen?', sh: 'Smukke grafer deler det hele op', she: '🥧', home: 'Bolig  59%', travel: 'Mad  22%', food: 'Transport  9%', total: 'Samlet Udgift', totalValue: '$2,899.22' },
    s5:  { h: 'Hver Krone\ner Din Tid', hl: 'Din Tid', sh: 'Se præcis hvor længe du arbejdede', she: '⏰', time: '112h 24m', timeLabel: 'denne måned', money: '$2,899.22' },
    s6:  { h: 'Hvor Meget\nSparer Du?', hl: 'Sparer Du?', sh: 'Mål hver måned. Skab vanen', she: '📊', healthy: '20%+ er sundt', income: 'Indkomst', expense: 'Udgift', saved: 'Sparet' },
    s7:  { h: 'Registrér\npå Sekunder', hl: 'på Sekunder', sh: 'Hurtig indtastning fra startskærmen', she: '⚡', saved: 'Gemt!', quick: 'Tilføj', mood: '~15m arbejde' },
    s8:  { h: 'Del\nRegningen', hl: 'Regningen', sh: 'Del regninger, humør, noter — du vælger', she: '✍️', splitBill: 'Del Regning', mood: 'Humør', note: 'Noter' },
    s9:  { h: 'Hvad Tjener\nDu Reelt?', hl: 'Du Reelt?', sh: 'Timeløn pr. måned, altid opdateret', she: '💡', rate: '$25.79', perHour: 'pr. time', revealed: 'Aktuel sats', current: 'May 2026 — aktuel' },
    s10: { h: 'Abonnementer\nUnder Kontrol', hl: 'Under Kontrol', sh: 'Husleje, medlemskaber, faste regninger', she: '🔁', total: '$1,556.99 / md', rent: 'Husleje', gym: 'Fitness', streaming: 'Streaming-pakke' },
    s11: { h: 'Gør Den\nTil Din', hl: 'Til Din', sh: 'Tilpas hvert hjørne af appen', she: '⚙️', display: 'Visning', hourly: 'Timeværdi', categories: 'Kategorier' },
    s12: { h: 'Vælg Din\nStil', hl: 'Stil', sh: 'Sprog, valuta og tema — på din måde', she: '🎨', language: 'Dansk (da)', currency: 'USD ($)', theme: 'Lys · Salvie' },
    s13: { h: 'Importér\nMed Ét Tryk', hl: 'Med Ét Tryk', sh: 'AI læser din kontoudskrift. Du bekræfter', she: '🤖', aiPowered: 'AI-drevet', oneTap: 'Kopiér Tekst', pasteJSON: 'Indsæt JSON' },
    s14: { h: 'Skriv.\nTryk. Klar.', hl: 'Klar.', sh: 'Dit tastatur er den hurtigste vej ind', she: '⌨️', type: 'Kaffe 6.50', tap: '↵', done: '0m at notere', category: 'Auto · Mad / Kaffe' },
    s15: {
      h: 'Dine data\nforbliver dine.', hl: 'forbliver dine.',
      privacy: 'Privatliv indbygget', privacySub: 'Gemt på din telefon. Synkronisering er valgfri.',
      noAds: 'Ingen reklamer', noAdsSub: 'Ingen distraktioner. Kun din økonomi.',
      local: 'Lokal først', localSub: 'Virker offline. Ingen konto nødvendig.',
      users: '70.000+ brugere',
      inspiredPre: 'Inspireret af',
      bookSub: 'Penge er den livsenergi, du bytter væk for dem',
    },
    s16: { h: 'Sæt et Budget.\nHold Kursen.', hl: 'Hold Kursen.', sh: 'Hver kategori, altid i syne', she: '🎯', ring: '80%', left: '$730.85 tilbage', budgeted: 'Budgetterede udgifter', unbudgeted: 'Ikke budgetteret' },
  },

  feature: {
    titleA: 'Hver krone du bruger',
    titleB: { pre: 'er ', hl: 'timer', post: ' af dit liv.' },
    sub: 'Se din reelle timeløn',
  },

  landing: {
    titleA: 'Din kaffe til $5 kostede lige',
    titleB: '12 minutter af livet.',
    subtitle: 'Se den reelle tidspris på hvert køb.',
  },
};

export default da;
