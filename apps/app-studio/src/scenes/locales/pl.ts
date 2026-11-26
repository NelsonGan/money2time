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
    s1:  { h: 'Każdy wpis,\nw godzinach.', hl: 'w godzinach.', sh: 'Twój budżet mówi o pieniądzach i czasie', she: '⏳', price: '$10.10', time: '23m', timeSub: 'pracy' },
    s2:  { h: 'Pieniądze.\nJedno miejsce.', hl: 'Jedno miejsce.', sh: 'Majątek, oszczędności, kredyt — pod ręką', she: '💚', netWorth: '$55,931', netWorthLabel: 'Majątek', checking: 'Konto codzienne', checkingSub: 'Na co dzień', checkingValue: '$31,079', savings: 'Konto oszczędnościowe', savingsSub: 'Cele', savingsValue: '$15,004' },
    s3:  { h: 'Każdy dzień\nw skrócie', hl: 'w skrócie', sh: 'Wizualny kalendarz wydatków', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Dziś wydane', amount: '$76.55', food: 'Jedzenie', shopping: 'Zakupy', transport: 'Transport' },
    s4:  { h: 'Na co idą\nTwoje pieniądze?', hl: 'Twoje pieniądze?', sh: 'Czytelne wykresy rozkładają to na czynniki', she: '🥧', home: 'Dom  59%', travel: 'Jedzenie  22%', food: 'Transport  9%', total: 'Wydatki razem', totalValue: '$2,899.22' },
    s5:  { h: 'Każdy dolar\nto Twój czas', hl: 'Twój czas', sh: 'Zobacz, ile na niego pracowałeś', she: '⏰', time: '112h 24m', timeLabel: 'w tym miesiącu', money: '$2,899.22' },
    s6:  { h: 'Ile\noszczędzasz?', hl: 'oszczędzasz?', sh: 'Mierz co miesiąc. Wyrób nawyk', she: '📊', healthy: '20%+ to zdrowo', income: 'Przychód', expense: 'Wydatek', saved: 'Odłożone' },
    s7:  { h: 'Zapisuj wydatki\nw kilka sekund', hl: 'w kilka sekund', sh: 'Szybki wpis z ekranu głównego', she: '⚡', saved: 'Zapisano!', quick: 'Szybki wpis', mood: '~15m pracy' },
    s8:  { h: 'Podziel\nrachunek', hl: 'rachunek', sh: 'Podział rachunku, nastrój, notatki — Ty decydujesz', she: '✍️', splitBill: 'Podział', mood: 'Nastrój', note: 'Notatki' },
    s9:  { h: 'Ile naprawdę\nzarabiasz?', hl: 'zarabiasz?', sh: 'Stawka godzinowa miesiąca, zawsze świeża', she: '💡', rate: '$25.79', perHour: 'na godzinę', revealed: 'Stawka teraz', current: 'May 2026 — teraz' },
    s10: { h: 'Subskrypcje\npod kontrolą', hl: 'pod kontrolą', sh: 'Czynsz, abonamenty, stałe rachunki', she: '🔁', total: '$1,556.99 / mies.', rent: 'Czynsz za mieszkanie', gym: 'Karnet na siłownię', streaming: 'Pakiet streamingowy' },
    s11: { h: 'Zrób ją\nswoją', hl: 'swoją', sh: 'Spersonalizuj każdy kąt aplikacji', she: '⚙️', display: 'Wyświetlanie', hourly: 'Stawka godzinowa', categories: 'Kategorie' },
    s12: { h: 'Wybierz\nswój styl', hl: 'swój styl', sh: 'Język, waluta i motyw — po swojemu', she: '🎨', language: 'Polski (pl)', currency: 'USD ($)', theme: 'Jasny · Szałwia' },
    s13: { h: 'Import\nbez wysiłku', hl: 'bez wysiłku', sh: 'AI czyta wyciąg. Ty potwierdzasz', she: '🤖', aiPowered: 'Z AI', oneTap: 'Kopiuj polecenie', pasteJSON: 'Wklej JSON' },
    s14: { h: 'Wpisz.\nStuknij. Gotowe.', hl: 'Gotowe.', sh: 'Klawiatura to najszybsza droga', she: '⌨️', type: 'Kawa 6.50', tap: '↵', done: '0m na wpis', category: 'Auto · Jedzenie / Kawa' },
    s15: {
      h: 'Twoje dane\nnależą do Ciebie.', hl: 'należą do Ciebie.',
      privacy: 'Pełna prywatność', privacySub: 'Zapisane w telefonie. Synchronizacja jest opcjonalna.',
      noAds: 'Bez reklam', noAdsSub: 'Zero rozpraszaczy. Tylko Twoje finanse.',
      local: 'Najpierw lokalnie', localSub: 'Działa offline. Bez zakładania konta.',
      users: '70 000+ użytkowników',
      inspiredPre: 'Inspiracja',
      bookSub: 'Pieniądze to energia życiowa, którą za nie oddajesz',
      bookDesc: 'Ponadczasowy klasyk finansów osobistych. Praktyczna mądrość o pieniądzach, czasie i życiu.',
    },
    s16: { h: 'Ustal budżet.\nTrzymaj kurs.', hl: 'Trzymaj kurs.', sh: 'Każda kategoria zawsze na widoku', she: '🎯', ring: '80%', left: 'zostało $730.85', budgeted: 'Wydatki w budżecie', unbudgeted: 'Poza budżetem' },
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
