import type { LocaleModule } from './types';

/**
 * German (de) — translation of the canonical English module. Numeric /
 * currency / date tokens are kept verbatim from English because every locale
 * renders on top of the English screenshots and must match the baked-in pixels.
 */
const de: LocaleModule = {
  meta: { code: 'de', flag: '🇩🇪', label: 'Deutsch' },

  phone: {
    s1:  { h: 'Jede Zeile,\nin Stunden.', hl: 'in Stunden.', sh: 'Dein Konto spricht Geld und Zeit', she: '⏳', price: '$10.10', time: '23m', timeSub: 'Arbeit' },
    s2:  { h: 'Dein Geld.\nEin Ort.', hl: 'Ein Ort.', sh: 'Vermögen, Sparen, Kredit — alles im Blick', she: '💚', netWorth: '$55,931', netWorthLabel: 'Vermögen', checking: 'Girokonto', checkingSub: 'Alltag', checkingValue: '$31,079', savings: 'Tagesgeld', savingsSub: 'Ziele', savingsValue: '$15,004' },
    s3:  { h: 'Jeder Tag\nim Blick', hl: 'im Blick', sh: 'Visueller Kalender deiner Ausgaben', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Heute', amount: '$76.55', food: 'Essen', shopping: 'Shopping', transport: 'Verkehr' },
    s4:  { h: 'Wohin geht\ndein Geld?', hl: 'dein Geld?', sh: 'Schöne Diagramme zeigen alles auf', she: '🥧', home: 'Wohnen  59%', travel: 'Essen  22%', food: 'Verkehr  9%', total: 'Ausgaben gesamt', totalValue: '$2,899.22' },
    s5:  { h: 'Geld ist\ndeine Zeit', hl: 'deine Zeit', sh: 'Sieh genau, wie lang du dafür arbeitest', she: '⏰', time: '112h 24m', timeLabel: 'diesen Monat', money: '$2,899.22' },
    s6:  { h: 'Wie viel\nbleibt dir?', hl: 'bleibt dir?', sh: 'Jeden Monat verfolgen. Gewohnheit bauen', she: '📊', healthy: '20%+ ist gesund', income: 'Einnahmen', expense: 'Ausgaben', saved: 'Gespart' },
    s7:  { h: 'In Sekunden\nerfasst', hl: 'erfasst', sh: 'Schnelle Eingabe vom Startbildschirm', she: '⚡', saved: 'Gespart!', quick: 'Schnell', mood: '~15m Arbeit' },
    s8:  { h: 'Rechnung\nteilen', hl: 'teilen', sh: 'Rechnung teilen, Stimmung, Notizen — du', she: '✍️', splitBill: 'Teilen', mood: 'Stimmung', note: 'Notizen' },
    s9:  { h: 'Was bleibt\ndir wirklich?', hl: 'dir wirklich?', sh: 'Stundenlohn pro Monat, laufend aktuell', she: '💡', rate: '$25.79', perHour: 'pro Stunde', revealed: 'Aktuell', current: 'May 2026 — aktuell' },
    s10: { h: 'Abos im\nGriff', hl: 'Griff', sh: 'Miete, Mitgliedschaften, laufende Kosten', she: '🔁', total: '$1,556.99 / Mt.', rent: 'Wohnungsmiete', gym: 'Fitness-Abo', streaming: 'Streaming-Paket' },
    s11: { h: 'Mach es\nzu deinem', hl: 'zu deinem', sh: 'Personalisiere jede Ecke der App', she: '⚙️', display: 'Anzeige', hourly: 'Stundenwert', categories: 'Kategorien' },
    s12: { h: 'Dein\nStil', hl: 'Stil', sh: 'Sprache, Währung und Thema — wie du willst', she: '🎨', language: 'Deutsch (de)', currency: 'USD ($)', theme: 'Hell · Salbei' },
    s13: { h: 'Import\nper Tipp', hl: 'per Tipp', sh: 'KI liest deinen Beleg. Du bestätigst', she: '🤖', aiPowered: 'KI-gestützt', oneTap: 'Prompt kopieren', pasteJSON: 'JSON einfügen' },
    s14: { h: 'Tippen.\nFertig.', hl: 'Fertig.', sh: 'Deine Tastatur ist der schnellste Weg', she: '⌨️', type: 'Kaffee 6.50', tap: '↵', done: '0m erfasst', category: 'Auto · Essen / Kaffee' },
    s16: { h: 'Budget setzen.\nKurs halten.', hl: 'Kurs halten.', sh: 'Jede Kategorie, immer im Blick', she: '🎯', ring: '80%', left: '$730.85 übrig', budgeted: 'Budgetierte Ausgaben', unbudgeted: 'Nicht budgetiert' },
  },

  feature: {
    titleA: 'Jeder Euro, den du ausgibst',
    titleB: { pre: 'ist ', hl: 'Lebenszeit', post: '.' },
    sub: 'Sieh deinen echten Stundenlohn',
  },

  landing: {
    titleA: 'Dein $5-Kaffee',
    titleB: 'kostete 12 Minuten Leben.',
    subtitle: 'Sieh den wahren Zeit-Preis jedes Kaufs.',
  },
};

export default de;
