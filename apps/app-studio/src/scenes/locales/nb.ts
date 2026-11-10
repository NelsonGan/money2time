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
    s1:  { h: 'Hver Rad,\ni Timer.', hl: 'i Timer.', sh: 'Regnskapet snakker penger og tid', she: '⏳', price: '$10.10', time: '23m', timeSub: 'med jobb' },
    s2:  { h: 'Alle Pengene.\nÉtt Sted.', hl: 'Étt Sted.', sh: 'Formue, sparing, kreditt — alt i sikte', she: '💚', netWorth: '$55,931', netWorthLabel: 'Formue', checking: 'Brukskonto', checkingSub: 'Daglig', checkingValue: '$31,079', savings: 'Høyrentekonto', savingsSub: 'Mål', savingsValue: '$15,004' },
    s3:  { h: 'Se Hver Dag\nKjapt', hl: 'Kjapt', sh: 'Visuell kalender over forbruket', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Brukt i dag', amount: '$76.55', food: 'Mat', shopping: 'Shopping', transport: 'Transport' },
    s4:  { h: 'Hvor Tar\nPengene Veien?', hl: 'Pengene Veien?', sh: 'Tydelige grafer bryter alt ned', she: '🥧', home: 'Hjem  59%', travel: 'Mat  22%', food: 'Transport  9%', total: 'Sum Utgift', totalValue: '$2,899.22' },
    s5:  { h: 'Hver Krone\ner Din Tid', hl: 'Din Tid', sh: 'Se nøyaktig hvor lenge du jobbet', she: '⏰', time: '112h 24m', timeLabel: 'denne mnd', money: '$2,899.22' },
    s6:  { h: 'Hvor Mye\nSparer Du?', hl: 'Sparer Du?', sh: 'Mål hver måned. Bygg vanen', she: '📊', healthy: '20%+ er sunt', income: 'Inntekt', expense: 'Utgift', saved: 'Spart' },
    s7:  { h: 'Før Forbruk\npå Sekunder', hl: 'på Sekunder', sh: 'Rask føring rett fra startskjermen', she: '⚡', saved: 'Lagret!', quick: 'Legg til', mood: '~15m med jobb' },
    s8:  { h: 'Del\nRegningen', hl: 'Regningen', sh: 'Del regning, humør, notater — du velger', she: '✍️', splitBill: 'Del Regning', mood: 'Humør', note: 'Notater' },
    s9:  { h: 'Hva Tjener\nDu Egentlig?', hl: 'Du Egentlig?', sh: 'Timelønn per måned, alltid oppdatert', she: '💡', rate: '$25.79', perHour: 'per time', revealed: 'Siste sats', current: 'May 2026 — nå' },
    s10: { h: 'Abonnement\nUnder Kontroll', hl: 'Under Kontroll', sh: 'Husleie, medlemskap, faste regninger', she: '🔁', total: '$1,556.99 / mnd', rent: 'Husleie', gym: 'Treningsmedlemskap', streaming: 'Strømmepakke' },
    s11: { h: 'Gjør Den\ntil Din', hl: 'til Din', sh: 'Tilpass hver krok av appen', she: '⚙️', display: 'Visning', hourly: 'Timeverdi', categories: 'Kategorier' },
    s12: { h: 'Velg Din\nStil', hl: 'Stil', sh: 'Språk, valuta og tema — på din måte', she: '🎨', language: 'Norsk (nb)', currency: 'USD ($)', theme: 'Lys · Salvie' },
    s13: { h: 'Importer\nmed Ett Trykk', hl: 'med Ett Trykk', sh: 'KI leser kontoutskriften. Du bekrefter', she: '🤖', aiPowered: 'Med KI', oneTap: 'Kopier Tekst', pasteJSON: 'Lim inn JSON' },
    s14: { h: 'Skriv.\nTrykk. Ferdig.', hl: 'Ferdig.', sh: 'Tastaturet er den raskeste veien', she: '⌨️', type: 'Kaffe 6.50', tap: '↵', done: '0m å føre', category: 'Auto · Mat / Kaffe' },
    s16: { h: 'Sett et Budsjett.\nHold Kursen.', hl: 'Hold Kursen.', sh: 'Hver kategori, alltid synlig', she: '🎯', ring: '80%', left: '$730.85 igjen', budgeted: 'Budsjetterte utgifter', unbudgeted: 'Ikke budsjettert' },
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
