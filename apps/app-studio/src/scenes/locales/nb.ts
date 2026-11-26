import type { LocaleModule } from './types';

/**
 * Norwegian Bokmål — translation of the English source. Numeric / currency /
 * date tokens are reused verbatim from English because every locale renders on
 * top of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const nb: LocaleModule = {
  meta: { code: 'nb', flag: '🇳🇴', label: 'Norsk' },

  phone: {
    s1:  { h: 'Hver rad,\ni timer.', hl: 'i timer.', sh: 'Regnskapet snakker penger og tid', she: '⏳', price: '$10.10', time: '23m', timeSub: 'arbeid' },
    s2:  { h: 'Alle pengene.\nEtt sted.', hl: 'Ett sted.', sh: 'Formue, sparing, kreditt — alt i sikte', she: '💚', netWorth: '$55,931', netWorthLabel: 'Formue', checking: 'Brukskonto', checkingSub: 'Daglig', checkingValue: '$31,079', savings: 'Høyrentekonto', savingsSub: 'Mål', savingsValue: '$15,004' },
    s3:  { h: 'Se hver dag\nmed ett blikk', hl: 'med ett blikk', sh: 'Visuell kalender over forbruket', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Brukt i dag', amount: '$76.55', food: 'Mat', shopping: 'Shopping', transport: 'Transport' },
    s4:  { h: 'Hvor tar\npengene veien?', hl: 'pengene veien?', sh: 'Tydelige grafer bryter alt ned', she: '🥧', home: 'Hjem  59%', travel: 'Mat  22%', food: 'Transport  9%', total: 'Totale utgifter', totalValue: '$2,899.22' },
    s5:  { h: 'Hver krone\ner din tid', hl: 'din tid', sh: 'Se nøyaktig hvor lenge du jobbet', she: '⏰', time: '112h 24m', timeLabel: 'denne mnd', money: '$2,899.22' },
    s6:  { h: 'Hvor mye\nsparer du?', hl: 'sparer du?', sh: 'Mål hver måned. Bygg vanen', she: '📊', healthy: '20%+ er sunt', income: 'Inntekt', expense: 'Utgift', saved: 'Spart' },
    s7:  { h: 'Før forbruk\npå sekunder', hl: 'på sekunder', sh: 'Rask føring rett fra startskjermen', she: '⚡', saved: 'Lagret!', quick: 'Legg til', mood: '~15m arbeid' },
    s8:  { h: 'Del\nregningen', hl: 'regningen', sh: 'Del regning, humør, notater — du velger', she: '✍️', splitBill: 'Del regning', mood: 'Humør', note: 'Notater' },
    s9:  { h: 'Hva tjener\ndu egentlig?', hl: 'du egentlig?', sh: 'Timeverdi per måned, alltid oppdatert', she: '💡', rate: '$25.79', perHour: 'per time', revealed: 'Siste sats', current: 'May 2026 — nå' },
    s10: { h: 'Abonnementer\nunder kontroll', hl: 'under kontroll', sh: 'Husleie, medlemskap, faste regninger', she: '🔁', total: '$1,556.99 / mnd', rent: 'Husleie', gym: 'Treningsmedlemskap', streaming: 'Strømmepakke' },
    s11: { h: 'Gjør den\ntil din', hl: 'til din', sh: 'Tilpass hver krok av appen', she: '⚙️', display: 'Visning', hourly: 'Timeverdi', categories: 'Kategorier' },
    s12: { h: 'Velg din\nstil', hl: 'stil', sh: 'Språk, valuta og tema — på din måte', she: '🎨', language: 'Norsk (nb)', currency: 'USD ($)', theme: 'Lys · Salvie' },
    s13: { h: 'Importer\nmed ett trykk', hl: 'med ett trykk', sh: 'KI leser kontoutskriften. Du bekrefter', she: '🤖', aiPowered: 'Med KI', oneTap: 'Kopier prompt', pasteJSON: 'Lim inn JSON' },
    s14: { h: 'Skriv.\nTrykk. Ferdig.', hl: 'Ferdig.', sh: 'Tastaturet er den raskeste veien', she: '⌨️', type: 'Kaffe 6.50', tap: '↵', done: '0m å føre', category: 'Auto · Mat / Kaffe' },
    s15: {
      h: 'Dataene dine\nforblir dine.', hl: 'forblir dine.',
      privacy: 'Personvern innebygd', privacySub: 'Lagret på telefonen din. Synkronisering er valgfritt.',
      noAds: 'Ingen annonser', noAdsSub: 'Ingen distraksjoner. Bare økonomien din.',
      local: 'Lokalt først', localSub: 'Fungerer offline. Ingen konto nødvendig.',
      users: '70 000+ brukere',
      inspiredPre: 'Inspirert av',
      bookSub: 'Penger er livsenergien du bytter bort for dem',
      bookDesc: 'Den tidløse klassikeren om personlig økonomi. Praktisk visdom om penger, tid og liv.',
    },
    s16: { h: 'Sett et budsjett.\nHold kursen.', hl: 'Hold kursen.', sh: 'Hver kategori, alltid synlig', she: '🎯', ring: '80%', left: '$730.85 igjen', budgeted: 'Budsjetterte utgifter', unbudgeted: 'Ikke budsjettert' },
  },

  feature: {
    titleA: 'Hver krone du bruker',
    titleB: { pre: 'er ', hl: 'timer', post: ' av livet ditt.' },
    sub: 'Se din virkelige timelønn',
  },

  landing: {
    titleA: 'Kaffen til $5 kostet deg nettopp',
    titleB: '12 minutter av livet.',
    subtitle: 'Se den ekte tidsprisen på hvert kjøp.',
  },
};

export default nb;
