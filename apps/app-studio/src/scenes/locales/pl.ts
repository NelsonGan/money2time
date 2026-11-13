import type { LocaleModule } from './types';

/**
 * Polish — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const pl: LocaleModule = {
  meta: { code: 'pl', flag: '🇵🇱', label: 'Polski' },

  phone: {
    s1:  { h: 'Każdy Wpis,\nw Czasie.', hl: 'w Czasie.', sh: 'Twój budżet mówi o pieniądzach i czasie', she: '⏳', price: '$10.10', time: '23m', timeSub: 'pracy' },
    s2:  { h: 'Pieniądze.\nJedno Miejsce.', hl: 'Jedno Miejsce.', sh: 'Majątek, oszczędności, kredyt — pod ręką', she: '💚', netWorth: '$55,931', netWorthLabel: 'Majątek', checking: 'Konto Codzienne', checkingSub: 'Na co dzień', checkingValue: '$31,079', savings: 'Konto Oszczędnościowe', savingsSub: 'Cele', savingsValue: '$15,004' },
    s3:  { h: 'Każdy Dzień\nna Oko', hl: 'na Oko', sh: 'Wizualny kalendarz wydatków', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Dziś wydane', amount: '$76.55', food: 'Jedzenie', shopping: 'Zakupy', transport: 'Transport' },
    s4:  { h: 'Gdzie Idą\nPieniądze?', hl: 'Pieniądze?', sh: 'Czytelne wykresy rozkładają to na czynniki', she: '🥧', home: 'Dom  59%', travel: 'Jedzenie  22%', food: 'Transport  9%', total: 'Wydatki Razem', totalValue: '$2,899.22' },
    s5:  { h: 'Każdy Dolar\nto Twój Czas', hl: 'Twój Czas', sh: 'Zobacz, ile na niego pracowałeś', she: '⏰', time: '112h 24m', timeLabel: 'ten miesiąc', money: '$2,899.22' },
    s6:  { h: 'Ile\nOszczędzasz?', hl: 'Oszczędzasz?', sh: 'Mierz co miesiąc. Wyrób nawyk', she: '📊', healthy: '20%+ to zdrowo', income: 'Przychód', expense: 'Wydatek', saved: 'Odłożone' },
    s7:  { h: 'Zapisuj\nw Sekundy', hl: 'w Sekundy', sh: 'Szybki wpis z ekranu głównego', she: '⚡', saved: 'Zapisano!', quick: 'Dodaj', mood: '~15m pracy' },
    s8:  { h: 'Podziel\nRachunek', hl: 'Rachunek', sh: 'Podział rachunku, nastrój, notatki — Ty decydujesz', she: '✍️', splitBill: 'Podział', mood: 'Nastrój', note: 'Notatki' },
    s9:  { h: 'Ile\nNaprawdę?', hl: 'Naprawdę?', sh: 'Stawka godzinowa miesiąca, zawsze świeża', she: '💡', rate: '$25.79', perHour: 'na godzinę', revealed: 'Stawka teraz', current: 'May 2026 — teraz' },
    s10: { h: 'Subskrypcje\nPod Kontrolą', hl: 'Pod Kontrolą', sh: 'Czynsz, abonamenty, stałe rachunki', she: '🔁', total: '$1,556.99 / mc', rent: 'Czynsz Mieszkanie', gym: 'Karnet Siłownia', streaming: 'Pakiet Streaming' },
    s11: { h: 'Zrób Ją\nSwoją', hl: 'Swoją', sh: 'Spersonalizuj każdy kąt aplikacji', she: '⚙️', display: 'Ekran', hourly: 'Wartość godziny', categories: 'Kategorie' },
    s12: { h: 'Wybierz\nStyl', hl: 'Styl', sh: 'Język, waluta i motyw — po swojemu', she: '🎨', language: 'Polski (pl)', currency: 'USD ($)', theme: 'Jasny · Szałwia' },
    s13: { h: 'Import\nza Dotyk', hl: 'za Dotyk', sh: 'AI czyta wyciąg. Ty potwierdzasz', she: '🤖', aiPowered: 'Z AI', oneTap: 'Kopiuj Tekst', pasteJSON: 'Wklej JSON' },
    s14: { h: 'Pisz.\nTknij. Już.', hl: 'Już.', sh: 'Klawiatura to najszybsza droga', she: '⌨️', type: 'Kawa 6.50', tap: '↵', done: '0m na wpis', category: 'Auto · Jedzenie / Kawa' },
    s15: {
      h: 'Twoje dane\nzostają twoje.', hl: 'zostają twoje.',
      privacy: 'Pełna prywatność', privacySub: 'Zapisane w telefonie. Synchronizacja jest opcjonalna.',
      noAds: 'Bez reklam', noAdsSub: 'Zero rozpraszaczy. Tylko twoje finanse.',
      local: 'Najpierw lokalnie', localSub: 'Działa offline. Bez zakładania konta.',
      users: '70 000+ użytkowników',
      inspiredPre: 'Inspiracja',
      bookSub: 'Pieniądze to energia życiowa, którą za nie oddajesz',
    },
    s16: { h: 'Ustal Budżet.\nTrzymaj Kurs.', hl: 'Trzymaj Kurs.', sh: 'Każda kategoria zawsze na widoku', she: '🎯', ring: '80%', left: 'zostało $730.85', budgeted: 'Wydatki w budżecie', unbudgeted: 'Poza budżetem' },
  },

  feature: {
    titleA: 'Każdy wydany dolar',
    titleB: { pre: 'to ', hl: 'godziny', post: ' Twojego życia.' },
    sub: 'Zobacz swoją realną stawkę godzinową',
  },

  landing: {
    titleA: 'Twoja kawa za $5 właśnie kosztowała',
    titleB: '12 minut życia.',
    subtitle: 'Zobacz prawdziwą cenę czasu każdego zakupu.',
  },
};

export default pl;
