import type { LocaleModule } from './types';

/**
 * Hindi — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const hi: LocaleModule = {
  meta: { code: 'hi', flag: '🇮🇳', label: 'हिन्दी' },

  phone: {
    s1:  { h: 'हर पंक्ति,\nघंटों में।', hl: 'घंटों में।', sh: 'आपका खाता पैसे और समय में बोलता है', she: '⏳', price: '$10.10', time: '23m', timeSub: 'काम के' },
    s2:  { h: 'सारा पैसा।\nएक जगह।', hl: 'एक जगह।', sh: 'नेट वर्थ, बचत, क्रेडिट — सब नज़र में', she: '💚', netWorth: '$55,931', netWorthLabel: 'नेट वर्थ', checking: 'रोज़ का खाता', checkingSub: 'रोज़ाना', checkingValue: '$31,079', savings: 'हाई यील्ड बचत', savingsSub: 'लक्ष्य', savingsValue: '$15,004' },
    s3:  { h: 'हर दिन देखें\nएक नज़र में', hl: 'एक नज़र में', sh: 'आपके खर्च का दृश्य कैलेंडर', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'आज खर्च', amount: '$76.55', food: 'खाना', shopping: 'खरीदारी', transport: 'यातायात' },
    s4:  { h: 'पैसा कहाँ\nजाता है?', hl: 'जाता है?', sh: 'सुंदर चार्ट सब कुछ समझाते हैं', she: '🥧', home: 'घर  59%', travel: 'खाना  22%', food: 'यातायात  9%', total: 'कुल खर्च', totalValue: '$2,899.22' },
    s5:  { h: 'हर डॉलर\nआपका समय', hl: 'आपका समय', sh: 'देखें इसके लिए कितना काम किया', she: '⏰', time: '112h 24m', timeLabel: 'इस माह', money: '$2,899.22' },
    s6:  { h: 'कितनी है\nआपकी बचत?', hl: 'आपकी बचत?', sh: 'हर माह नापें। आदत बनाएँ', she: '📊', healthy: '20%+ ठीक है', income: 'आय', expense: 'खर्च', saved: 'बचाया' },
    s7:  { h: 'खर्च लिखें\nसेकंडों में', hl: 'सेकंडों में', sh: 'होम स्क्रीन से तेज़ प्रविष्टि', she: '⚡', saved: 'सहेजा!', quick: 'त्वरित जोड़', mood: '~15m काम' },
    s8:  { h: 'बिल\nबाँटें', hl: 'बाँटें', sh: 'बिल बाँटें, मूड, नोट्स — आप तय करें', she: '✍️', splitBill: 'बिल बाँटें', mood: 'मूड', note: 'नोट्स' },
    s9:  { h: 'सच में कितना\nकमाते हैं?', hl: 'कमाते हैं?', sh: 'मासिक प्रति घंटा दर, हमेशा अपडेट', she: '💡', rate: '$25.79', perHour: 'प्रति घंटा', revealed: 'ताज़ा दर', current: 'May 2026 — वर्तमान' },
    s10: { h: 'सदस्यताएँ\nनियंत्रण में', hl: 'नियंत्रण में', sh: 'किराया, सदस्यता, आवर्ती बिल', she: '🔁', total: '$1,556.99 / माह', rent: 'घर का किराया', gym: 'जिम सदस्यता', streaming: 'स्ट्रीमिंग पैक' },
    s11: { h: 'इसे बनाएँ\nअपना', hl: 'अपना', sh: 'ऐप के हर कोने को निजी बनाएँ', she: '⚙️', display: 'डिस्प्ले', hourly: 'प्रति घंटा मूल्य', categories: 'श्रेणियाँ' },
    s12: { h: 'चुनें अपना\nअंदाज़', hl: 'अंदाज़', sh: 'भाषा, मुद्रा और थीम — आपके तरीके से', she: '🎨', language: 'हिन्दी (hi)', currency: 'USD ($)', theme: 'हल्का · सेज' },
    s13: { h: 'आयात करें\nएक टैप में', hl: 'एक टैप में', sh: 'AI आपका स्टेटमेंट पढ़े। आप पुष्टि करें', she: '🤖', aiPowered: 'AI से', oneTap: 'प्रॉम्प्ट कॉपी', pasteJSON: 'JSON पेस्ट' },
    s14: { h: 'टाइप करें।\nटैप। हो गया।', hl: 'हो गया।', sh: 'आपका कीबोर्ड सबसे तेज़ रास्ता है', she: '⌨️', type: 'कॉफ़ी 6.50', tap: '↵', done: '0m में दर्ज', category: 'ऑटो · खाना / कॉफ़ी' },
    s16: { h: 'बजट बनाएँ।\nउस पर टिकें।', hl: 'उस पर टिकें।', sh: 'हर श्रेणी, हमेशा नज़र में', she: '🎯', ring: '80%', left: '$730.85 बचे', budgeted: 'बजट वाला खर्च', unbudgeted: 'बजट से बाहर' },
    s15: {
      privacy: 'निजता सबसे पहले', privacySub: 'आपका डेटा फ़ोन से बाहर नहीं जाता',
      heroSub: 'आपका डेटा आपके डिवाइस पर ही रहता है। हमेशा से, हमेशा के लिए।',
      noAds: 'कोई विज्ञापन नहीं', noAdsSub: 'कोई रुकावट नहीं। सिर्फ़ आपका पैसा।',
      local: 'पूरी तरह लोकल', localSub: 'ऑफ़लाइन काम करता है। खाते की ज़रूरत नहीं',
      inspiredPre: 'प्रेरणा स्रोत',
      bookSub: 'पैसा वह जीवन ऊर्जा है जो आप उसके बदले देते हैं',
      bookDesc: 'पर्सनल फाइनेंस की कालजयी किताब। पैसे, समय और जीवन की व्यावहारिक सीख।',
      downloads: '50,000+ उपयोगकर्ता',
    },
  },

  feature: {
    titleA: 'हर डॉलर जो आप खर्च करते हैं',
    titleB: { pre: 'आपकी ज़िंदगी के ', hl: 'घंटे', post: ' हैं।' },
    sub: 'देखें अपनी असली प्रति घंटा दर',
  },

  landing: {
    titleA: 'आपकी $5 की कॉफ़ी ने अभी छीन लिए',
    titleB: 'ज़िंदगी के 12 मिनट।',
    subtitle: 'हर खरीद का असली समय-मूल्य देखें।',
  },
};

export default hi;
