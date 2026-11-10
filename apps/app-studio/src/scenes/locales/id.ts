import type { LocaleModule } from './types';

/**
 * Indonesian — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const id: LocaleModule = {
  meta: { code: 'id', flag: '🇮🇩', label: 'Indonesia' },

  phone: {
    s1:  { h: 'Tiap Baris,\ndalam Jam.', hl: 'dalam Jam.', sh: 'Catatanmu bicara uang dan waktu', she: '⏳', price: '$10.10', time: '23m', timeSub: 'kerja' },
    s2:  { h: 'Semua Uangmu.\nSatu Tempat.', hl: 'Satu Tempat.', sh: 'Kekayaan, tabungan, kredit — terlihat', she: '💚', netWorth: '$55,931', netWorthLabel: 'Kekayaan', checking: 'Rekening Harian', checkingSub: 'Harian', checkingValue: '$31,079', savings: 'Tabungan Bunga Tinggi', savingsSub: 'Target', savingsValue: '$15,004' },
    s3:  { h: 'Lihat Tiap Hari\nSekilas', hl: 'Sekilas', sh: 'Kalender visual pengeluaranmu', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Hari ini', amount: '$76.55', food: 'Makanan', shopping: 'Belanja', transport: 'Transport' },
    s4:  { h: 'Ke Mana\nUangmu Pergi?', hl: 'Uangmu Pergi?', sh: 'Grafik indah memecah semuanya', she: '🥧', home: 'Rumah  59%', travel: 'Makanan  22%', food: 'Transport  9%', total: 'Total Belanja', totalValue: '$2,899.22' },
    s5:  { h: 'Tiap Dolar\nadalah Waktu', hl: 'adalah Waktu', sh: 'Lihat berapa lama kamu bekerja untuknya', she: '⏰', time: '112h 24m', timeLabel: 'bulan ini', money: '$2,899.22' },
    s6:  { h: 'Berapa Rasio\nTabunganmu?', hl: 'Tabunganmu?', sh: 'Pantau tiap bulan. Bangun kebiasaan', she: '📊', healthy: '20%+ itu sehat', income: 'Masuk', expense: 'Keluar', saved: 'Ditabung' },
    s7:  { h: 'Catat Belanja\ndalam Detik', hl: 'dalam Detik', sh: 'Input cepat dari layar utama', she: '⚡', saved: 'Tersimpan!', quick: 'Tambah', mood: '~15m kerja' },
    s8:  { h: 'Bagi\nTagihan', hl: 'Tagihan', sh: 'Bagi tagihan, mood, catatan — terserah', she: '✍️', splitBill: 'Bagi Tagihan', mood: 'Mood', note: 'Catatan' },
    s9:  { h: 'Berapa Aslinya\nKamu Dapat?', hl: 'Kamu Dapat?', sh: 'Tarif per jam bulanan, selalu terkini', she: '💡', rate: '$25.79', perHour: 'per jam', revealed: 'Tarif terkini', current: 'May 2026 — kini' },
    s10: { h: 'Langganan\nTerkendali', hl: 'Terkendali', sh: 'Sewa, keanggotaan, tagihan rutin', she: '🔁', total: '$1,556.99 / bln', rent: 'Sewa Apartemen', gym: 'Keanggotaan Gym', streaming: 'Paket Streaming' },
    s11: { h: 'Jadikan\nMilikmu', hl: 'Milikmu', sh: 'Personalisasi tiap sudut aplikasi', she: '⚙️', display: 'Tampilan', hourly: 'Nilai per jam', categories: 'Kategori' },
    s12: { h: 'Pilih\nGayamu', hl: 'Gayamu', sh: 'Bahasa, mata uang, dan tema — sesukamu', she: '🎨', language: 'Indonesia (id)', currency: 'USD ($)', theme: 'Terang · Sage' },
    s13: { h: 'Impor\nSekali Ketuk', hl: 'Sekali Ketuk', sh: 'AI baca laporanmu. Kamu konfirmasi', she: '🤖', aiPowered: 'Pakai AI', oneTap: 'Salin Teks', pasteJSON: 'Tempel JSON' },
    s14: { h: 'Ketik.\nKetuk. Beres.', hl: 'Beres.', sh: 'Keyboard adalah cara tercepat', she: '⌨️', type: 'Kopi 6.50', tap: '↵', done: '0m mencatat', category: 'Otomatis · Makanan / Kopi' },
    s16: { h: 'Atur Anggaran.\nTetap di Jalur.', hl: 'Tetap di Jalur.', sh: 'Setiap kategori, selalu terlihat', she: '🎯', ring: '80%', left: 'sisa $730.85', budgeted: 'Belanja teranggarkan', unbudgeted: 'Belanja di luar anggaran' },
  },

  feature: {
    titleA: 'Tiap dolar yang kamu belanjakan',
    titleB: { pre: 'adalah ', hl: 'jam', post: ' hidupmu.' },
    sub: 'Lihat tarif per jam aslimu',
  },

  landing: {
    titleA: 'Kopi $5-mu baru saja menghabiskan',
    titleB: '12 menit hidup.',
    subtitle: 'Lihat harga waktu sesungguhnya tiap pembelian.',
  },
};

export default id;
