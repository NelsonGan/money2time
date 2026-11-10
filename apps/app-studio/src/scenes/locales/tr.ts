import type { LocaleModule } from './types';

/**
 * Turkish — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const tr: LocaleModule = {
  meta: { code: 'tr', flag: '🇹🇷', label: 'Türkçe' },

  phone: {
    s1:  { h: 'Her Satır,\nSaate Çevrik.', hl: 'Saate Çevrik.', sh: 'Hesabın parayı ve zamanı konuşur', she: '⏳', price: '$10.10', time: '23m', timeSub: 'çalışma' },
    s2:  { h: 'Tüm Paran.\nTek Yerde.', hl: 'Tek Yerde.', sh: 'Servet, birikim, kredi — hepsi göz önünde', she: '💚', netWorth: '$55,931', netWorthLabel: 'Net Servet', checking: 'Günlük Hesap', checkingSub: 'Gündelik', checkingValue: '$31,079', savings: 'Yüksek Faizli Birikim', savingsSub: 'Hedefler', savingsValue: '$15,004' },
    s3:  { h: 'Her Günü\nBir Bakışta', hl: 'Bir Bakışta', sh: 'Harcamanın görsel takvimi', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Bugün harcanan', amount: '$76.55', food: 'Yemek', shopping: 'Alışveriş', transport: 'Ulaşım' },
    s4:  { h: 'Paran Nereye\nGidiyor?', hl: 'Gidiyor?', sh: 'Şık grafikler her şeyi açıklar', she: '🥧', home: 'Ev  59%', travel: 'Yemek  22%', food: 'Ulaşım  9%', total: 'Toplam Gider', totalValue: '$2,899.22' },
    s5:  { h: 'Her Dolar\nSenin Zamanın', hl: 'Senin Zamanın', sh: 'Onun için ne kadar çalıştığını gör', she: '⏰', time: '112h 24m', timeLabel: 'bu ay', money: '$2,899.22' },
    s6:  { h: 'Tasarruf\nOranın Ne?', hl: 'Oranın Ne?', sh: 'Her ayı izle. Alışkanlık kur', she: '📊', healthy: '20%+ sağlıklı', income: 'Gelir', expense: 'Gider', saved: 'Birikti' },
    s7:  { h: 'Saniyede\nHarcama İzle', hl: 'Harcama İzle', sh: 'Ana ekrandan hızlı giriş', she: '⚡', saved: 'Kaydedildi!', quick: 'Hızlı ekle', mood: '~15m çalışma' },
    s8:  { h: 'Hesabı\nBöl', hl: 'Böl', sh: 'Hesap böl, ruh hâli, not — sen karar ver', she: '✍️', splitBill: 'Hesap Böl', mood: 'Ruh Hâli', note: 'Notlar' },
    s9:  { h: 'Gerçekte Ne\nKazanıyorsun?', hl: 'Kazanıyorsun?', sh: 'Aylık saatlik ücret, anında güncel', she: '💡', rate: '$25.79', perHour: 'saat başına', revealed: 'Güncel ücret', current: 'May 2026 — güncel' },
    s10: { h: 'Abonelikler\nKontrolde', hl: 'Kontrolde', sh: 'Kira, üyelikler, düzenli ödemeler', she: '🔁', total: '$1,556.99 / ay', rent: 'Daire Kirası', gym: 'Spor Üyeliği', streaming: 'Yayın Paketi' },
    s11: { h: 'Sana Özel\nYap', hl: 'Yap', sh: 'Uygulamanın her köşesini kişiselleştir', she: '⚙️', display: 'Görünüm', hourly: 'Saatlik değer', categories: 'Kategoriler' },
    s12: { h: 'Tarzını\nSeç', hl: 'Seç', sh: 'Dil, para birimi ve tema — sana göre', she: '🎨', language: 'Türkçe (tr)', currency: 'USD ($)', theme: 'Açık · Adaçayı' },
    s13: { h: 'Tek Dokunuşla\nİçe Aktar', hl: 'İçe Aktar', sh: 'Yapay zekâ ekstrenı okur. Sen onaylarsın', she: '🤖', aiPowered: 'Yapay zekâ', oneTap: 'Metni Kopyala', pasteJSON: 'JSON Yapıştır' },
    s14: { h: 'Yaz.\nDokun. Bitti.', hl: 'Bitti.', sh: 'Klavyen en hızlı yoldur', she: '⌨️', type: 'Kahve 6.50', tap: '↵', done: '0m kayıt', category: 'Oto · Yemek / Kahve' },
    s16: { h: 'Bütçeni Kur.\nYolunda Kal.', hl: 'Yolunda Kal.', sh: 'Her kategori, her zaman görünür', she: '🎯', ring: '80%', left: '$730.85 kaldı', budgeted: 'Bütçeli harcama', unbudgeted: 'Bütçe dışı harcama' },
  },

  feature: {
    titleA: 'Harcadığın her dolar',
    titleB: { pre: 'hayatının ', hl: 'saatleri', post: '.' },
    sub: 'Gerçek saatlik ücretini gör',
  },

  landing: {
    titleA: '$5 kahven sana az önce',
    titleB: '12 dakika ömre mal oldu.',
    subtitle: 'Her alışverişin gerçek zaman bedelini gör.',
  },
};

export default tr;
