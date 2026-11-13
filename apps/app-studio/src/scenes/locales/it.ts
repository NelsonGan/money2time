import type { LocaleModule } from './types';

/**
 * Italian — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const it: LocaleModule = {
  meta: { code: 'it', flag: '🇮🇹', label: 'Italiano' },

  phone: {
    s1:  { h: 'Ogni Riga,\nin Ore.', hl: 'in Ore.', sh: 'Il tuo conto parla di soldi e tempo', she: '⏳', price: '$10.10', time: '23m', timeSub: 'di lavoro' },
    s2:  { h: 'Tutti i Soldi.\nUn Posto.', hl: 'Un Posto.', sh: 'Patrimonio, risparmi, credito — a vista', she: '💚', netWorth: '$55,931', netWorthLabel: 'Patrimonio', checking: 'Conto Corrente', checkingSub: 'Quotidiano', checkingValue: '$31,079', savings: 'Conto Deposito', savingsSub: 'Obiettivi', savingsValue: '$15,004' },
    s3:  { h: 'Vedi Ogni Giorno\nin un Colpo', hl: 'in un Colpo', sh: 'Calendario visivo delle tue spese', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Speso oggi', amount: '$76.55', food: 'Cibo', shopping: 'Acquisti', transport: 'Trasporti' },
    s4:  { h: 'Dove Finiscono\ni Tuoi Soldi?', hl: 'i Tuoi Soldi?', sh: 'Grafici chiari mostrano tutto', she: '🥧', home: 'Casa  59%', travel: 'Cibo  22%', food: 'Trasporti  9%', total: 'Spesa Totale', totalValue: '$2,899.22' },
    s5:  { h: 'Ogni Euro\nè Tempo Tuo', hl: 'è Tempo Tuo', sh: 'Scopri quanto hai lavorato per lui', she: '⏰', time: '112h 24m', timeLabel: 'questo mese', money: '$2,899.22' },
    s6:  { h: 'Quanto\nRisparmi?', hl: 'Risparmi?', sh: 'Misura ogni mese. Crea l\'abitudine', she: '📊', healthy: '20%+ è sano', income: 'Entrate', expense: 'Spese', saved: 'Risparmiato' },
    s7:  { h: 'Registra\nin Secondi', hl: 'in Secondi', sh: 'Inserimento rapido dalla home', she: '⚡', saved: 'Salvato!', quick: 'Aggiungi', mood: '~15m di lavoro' },
    s8:  { h: 'Dividi\nil Conto', hl: 'il Conto', sh: 'Dividi conti, umore, note — decidi tu', she: '✍️', splitBill: 'Dividi', mood: 'Umore', note: 'Note' },
    s9:  { h: 'Quanto\nGuadagni?', hl: 'Guadagni?', sh: 'Paga oraria mensile, sempre aggiornata', she: '💡', rate: '$25.79', perHour: 'all\'ora', revealed: 'Paga attuale', current: 'May 2026 — attuale' },
    s10: { h: 'Abbonamenti\nSotto Controllo', hl: 'Sotto Controllo', sh: 'Affitto, iscrizioni, spese ricorrenti', she: '🔁', total: '$1,556.99 / mese', rent: 'Affitto Casa', gym: 'Abbonamento Palestra', streaming: 'Pacchetto Streaming' },
    s11: { h: 'Rendila\nTua', hl: 'Tua', sh: 'Personalizza ogni angolo dell\'app', she: '⚙️', display: 'Schermo', hourly: 'Valore orario', categories: 'Categorie' },
    s12: { h: 'Scegli il\nTuo Stile', hl: 'Tuo Stile', sh: 'Lingua, valuta e tema — come vuoi tu', she: '🎨', language: 'Italiano (it)', currency: 'USD ($)', theme: 'Chiaro · Salvia' },
    s13: { h: 'Importa\ncon un Tap', hl: 'con un Tap', sh: 'L\'IA legge l\'estratto. Tu confermi', she: '🤖', aiPowered: 'Con IA', oneTap: 'Copia Testo', pasteJSON: 'Incolla JSON' },
    s14: { h: 'Scrivi.\nTocca. Fatto.', hl: 'Fatto.', sh: 'La tastiera è la via più veloce', she: '⌨️', type: 'Caffè 6.50', tap: '↵', done: '0m per segnare', category: 'Auto · Cibo / Caffè' },
    s15: {
      h: 'I tuoi dati\nrestano tuoi.', hl: 'restano tuoi.',
      privacy: 'Privacy integrata', privacySub: 'Salvati sul telefono. La sincronizzazione è facoltativa.',
      noAds: 'Niente pubblicità', noAdsSub: 'Zero distrazioni. Solo le tue finanze.',
      local: 'Prima in locale', localSub: 'Funziona offline. Nessun account richiesto.',
      users: '70.000+ utenti',
      inspiredPre: 'Ispirata a',
      bookSub: 'Il denaro è l’energia vitale che scambi per averlo',
    },
    s16: { h: 'Fissa il Budget.\nResta in Rotta.', hl: 'Resta in Rotta.', sh: 'Ogni categoria, sempre in vista', she: '🎯', ring: '80%', left: '$730.85 rimasti', budgeted: 'Spesa a budget', unbudgeted: 'Spesa fuori budget' },
  },

  feature: {
    titleA: 'Ogni euro che spendi',
    titleB: { pre: 'sono ', hl: 'ore', post: ' della tua vita.' },
    sub: 'Scopri la tua vera paga oraria',
  },

  landing: {
    titleA: 'Il tuo caffè da $5 ti è costato',
    titleB: '12 minuti di vita.',
    subtitle: 'Scopri il vero prezzo in tempo di ogni acquisto.',
  },
};

export default it;
