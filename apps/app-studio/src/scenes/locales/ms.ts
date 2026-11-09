import type { LocaleModule } from './types';

/**
 * Malay (Bahasa Melayu) — translation of the English source. Numeric / currency
 * / date tokens are reused verbatim from English because every locale renders on
 * top of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const ms: LocaleModule = {
  meta: { code: 'ms', flag: '🇲🇾', label: 'Melayu' },

  phone: {
    s1:  { h: 'Setiap Baris,\ndalam Jam.', hl: 'dalam Jam.', sh: 'Lejarmu bercakap wang dan masa', she: '⏳', price: '$10.10', time: '23m', timeSub: 'kerja' },
    s2:  { h: 'Semua Wangmu.\nSatu Tempat.', hl: 'Satu Tempat.', sh: 'Harta, simpanan, kredit — semua nampak', she: '💚', netWorth: '$55,931', netWorthLabel: 'Harta Bersih', checking: 'Akaun Harian', checkingSub: 'Harian', checkingValue: '$31,079', savings: 'Simpanan Faedah Tinggi', savingsSub: 'Matlamat', savingsValue: '$15,004' },
    s3:  { h: 'Lihat Tiap Hari\nSekilas', hl: 'Sekilas', sh: 'Kalendar visual perbelanjaanmu', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Hari ini', amount: '$76.55', food: 'Makanan', shopping: 'Beli-belah', transport: 'Transit' },
    s4:  { h: 'Ke Mana\nWangmu Pergi?', hl: 'Wangmu Pergi?', sh: 'Carta indah memecahkan semuanya', she: '🥧', home: 'Rumah  59%', travel: 'Makanan  22%', food: 'Pengangkutan  9%', total: 'Jumlah Belanja', totalValue: '$2,899.22' },
    s5:  { h: 'Setiap Dolar\nialah Masamu', hl: 'Masamu', sh: 'Lihat betapa lama kau bekerja untuknya', she: '⏰', time: '112h 24m', timeLabel: 'bulan ini', money: '$2,899.22' },
    s6:  { h: 'Berapa Kadar\nSimpananmu?', hl: 'Simpananmu?', sh: 'Pantau tiap bulan. Bina tabiat', she: '📊', healthy: '20%+ itu sihat', income: 'Pendapatan', expense: 'Perbelanjaan', saved: 'Disimpan' },
    s7:  { h: 'Catat Belanja\ndalam Saat', hl: 'dalam Saat', sh: 'Input pantas dari skrin utama', she: '⚡', saved: 'Tersimpan!', quick: 'Tambah', mood: '~15m kerja' },
    s8:  { h: 'Kongsi\nBil', hl: 'Bil', sh: 'Bahagi bil, mood, nota — kau pilih', she: '✍️', splitBill: 'Bahagi Bil', mood: 'Mood', note: 'Nota' },
    s9:  { h: 'Berapa Sebenar\nKau Dapat?', hl: 'Kau Dapat?', sh: 'Kadar sejam bulanan, sentiasa terkini', she: '💡', rate: '$25.79', perHour: 'sejam', revealed: 'Kadar terkini', current: 'May 2026 — kini' },
    s10: { h: 'Langganan\nTerkawal', hl: 'Terkawal', sh: 'Sewa, keahlian, bil berulang', she: '🔁', total: '$1,556.99 / bln', rent: 'Sewa Apartmen', gym: 'Keahlian Gym', streaming: 'Pakej Streaming' },
    s11: { h: 'Jadikan\nMilikmu', hl: 'Milikmu', sh: 'Peribadikan setiap sudut aplikasi', she: '⚙️', display: 'Paparan', hourly: 'Nilai sejam', categories: 'Kategori' },
    s12: { h: 'Pilih\nGayamu', hl: 'Gayamu', sh: 'Bahasa, mata wang, tema — caramu', she: '🎨', language: 'Melayu (ms)', currency: 'USD ($)', theme: 'Cerah · Sage' },
    s13: { h: 'Import\nSekali Ketik', hl: 'Sekali Ketik', sh: 'AI baca penyatamu. Kau sahkan', she: '🤖', aiPowered: 'Guna AI', oneTap: 'Salin Teks', pasteJSON: 'Tampal JSON' },
    s14: { h: 'Taip.\nKetik. Siap.', hl: 'Siap.', sh: 'Papan kekunci jalan terpantas', she: '⌨️', type: 'Kopi 6.50', tap: '↵', done: '0m catat', category: 'Auto · Makanan / Kopi' },
    s16: { h: 'Tetapkan Bajet.\nKekal Terkawal.', hl: 'Kekal Terkawal.', sh: 'Setiap kategori, sentiasa kelihatan', she: '🎯', ring: '80%', left: 'baki $730.85', budgeted: 'Perbelanjaan berbajet', unbudgeted: 'Perbelanjaan luar bajet' },
    s15: {
      privacy: 'Privasi diutamakan', privacySub: 'Data anda tidak pernah keluar dari telefon',
      heroSub: 'Data anda kekal dalam peranti anda. Dahulu, kini dan selamanya.',
      noAds: 'Tiada iklan', noAdsSub: 'Tiada gangguan. Hanya kewangan anda.',
      local: 'Sepenuhnya setempat', localSub: 'Berfungsi luar talian. Tiada akaun diperlukan',
      inspiredPre: 'Diilhamkan daripada',
      bookSub: 'Wang ialah tenaga hidup yang anda tukarkan',
      bookDesc: 'Panduan kewangan peribadi klasik yang abadi. Kebijaksanaan praktikal tentang wang, masa dan kehidupan.',
      downloads: '50,000+ pengguna',
    },
  },

  feature: {
    titleA: 'Setiap dolar kau belanja',
    titleB: { pre: 'ialah ', hl: 'jam', post: ' hidupmu.' },
    sub: 'Lihat kadar sejam sebenarmu',
  },

  landing: {
    titleA: 'Kopi $5-mu baru menelan',
    titleB: '12 minit hidup.',
    subtitle: 'Lihat harga masa sebenar setiap belian.',
  },
};

export default ms;
