import type { LocaleModule } from './types';

/**
 * Dutch — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const nl: LocaleModule = {
  meta: { code: 'nl', flag: '🇳🇱', label: 'Nederlands' },

  phone: {
    s1:  { h: 'Elke Regel,\nin Uren.', hl: 'in Uren.', sh: 'Je overzicht spreekt geld én tijd', she: '⏳', price: '$10.10', time: '23m', timeSub: 'werk' },
    s2:  { h: 'Al Je Geld.\nEén Plek.', hl: 'Eén Plek.', sh: 'Vermogen, spaargeld, krediet — in beeld', she: '💚', netWorth: '$55,931', netWorthLabel: 'Vermogen', checking: 'Betaalrekening', checkingSub: 'Dagelijks', checkingValue: '$31,079', savings: 'Spaarrekening Top', savingsSub: 'Doelen', savingsValue: '$15,004' },
    s3:  { h: 'Zie Elke Dag\nin Eén Blik', hl: 'in Eén Blik', sh: 'Visuele kalender van je uitgaven', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Vandaag uit', amount: '$76.55', food: 'Eten', shopping: 'Winkelen', transport: 'Vervoer' },
    s4:  { h: 'Waar Gaat\nJe Geld Heen?', hl: 'Je Geld Heen?', sh: 'Heldere grafieken splitsen alles uit', she: '🥧', home: 'Huis  59%', travel: 'Eten  22%', food: 'Vervoer  9%', total: 'Totale Uitgaven', totalValue: '$2,899.22' },
    s5:  { h: 'Elke Cent\nis Jouw Tijd', hl: 'is Jouw Tijd', sh: 'Zie precies hoe lang je ervoor werkte', she: '⏰', time: '112h 24m', timeLabel: 'deze maand', money: '$2,899.22' },
    s6:  { h: 'Hoeveel\nSpaar Je?', hl: 'Spaar Je?', sh: 'Meet elke maand. Bouw de gewoonte', she: '📊', healthy: '20%+ is gezond', income: 'Inkomen', expense: 'Uitgave', saved: 'Gespaard' },
    s7:  { h: 'Boek Uitgaven\nin Seconden', hl: 'in Seconden', sh: 'Snelle invoer vanaf het startscherm', she: '⚡', saved: 'Bewaard!', quick: 'Toevoegen', mood: '~15m werk' },
    s8:  { h: 'Deel\nde Rekening', hl: 'de Rekening', sh: 'Reken samen, stemming, notities — jij kiest', she: '✍️', splitBill: 'Splitsen', mood: 'Stemming', note: 'Notities' },
    s9:  { h: 'Wat Verdien\nJe Echt?', hl: 'Je Echt?', sh: 'Uurtarief per maand, altijd actueel', she: '💡', rate: '$25.79', perHour: 'per uur', revealed: 'Huidig tarief', current: 'May 2026 — actueel' },
    s10: { h: 'Abonnementen\nin de Hand', hl: 'in de Hand', sh: 'Huur, lidmaatschappen, vaste lasten', she: '🔁', total: '$1,556.99 / mnd', rent: 'Huur Woning', gym: 'Sportschool', streaming: 'Streamingpakket' },
    s11: { h: 'Maak Het\nVan Jou', hl: 'Van Jou', sh: 'Personaliseer elke hoek van de app', she: '⚙️', display: 'Weergave', hourly: 'Uurwaarde', categories: 'Categorieën' },
    s12: { h: 'Kies Je\nStijl', hl: 'Stijl', sh: 'Taal, valuta en thema — op jouw manier', she: '🎨', language: 'Nederlands (nl)', currency: 'USD ($)', theme: 'Licht · Salie' },
    s13: { h: 'Importeer\nin Eén Tik', hl: 'in Eén Tik', sh: 'AI leest je afschrift. Jij bevestigt', she: '🤖', aiPowered: 'Met AI', oneTap: 'Kopieer Tekst', pasteJSON: 'Plak JSON' },
    s14: { h: 'Typ.\nTik. Klaar.', hl: 'Klaar.', sh: 'Je toetsenbord is de snelste weg', she: '⌨️', type: 'Koffie 6.50', tap: '↵', done: '0m om te boeken', category: 'Auto · Eten / Koffie' },
    s15: {
      h: 'Jouw data\nblijft van jou.', hl: 'blijft van jou.',
      privacy: 'Privacy ingebouwd', privacySub: 'Opgeslagen op je telefoon. Synchroniseren is optioneel.',
      noAds: 'Geen advertenties', noAdsSub: 'Geen afleiding. Alleen je financiën.',
      local: 'Lokaal eerst', localSub: 'Werkt offline. Geen account nodig.',
      users: '70.000+ gebruikers',
      inspiredPre: 'Geïnspireerd door',
      bookSub: 'Geld is de levensenergie die je ervoor inruilt',
    },
    s16: { h: 'Stel een Budget.\nHou Koers.', hl: 'Hou Koers.', sh: 'Elke categorie, altijd in beeld', she: '🎯', ring: '80%', left: '$730.85 over', budgeted: 'Begrote uitgaven', unbudgeted: 'Niet begroot' },
  },

  feature: {
    titleA: 'Elke euro die je uitgeeft',
    titleB: { pre: 'is ', hl: 'uren', post: ' van je leven.' },
    sub: 'Zie je echte uurtarief',
  },

  landing: {
    titleA: 'Je koffie van $5 kostte je net',
    titleB: '12 minuten leven.',
    subtitle: 'Zie de echte tijdsprijs van elke aankoop.',
  },
};

export default nl;
