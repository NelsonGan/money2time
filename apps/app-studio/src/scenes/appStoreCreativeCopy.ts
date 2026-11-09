interface CreativeCopy {
  payment: { tap: string; done: string };
  search: [string, string];
}

/** One shared payment scene, with independently authored localized headlines and labels. */
export const APP_STORE_COPY: Record<string, CreativeCopy> = {
  en: { search: ['Track expenses', 'effortlessly'], payment: {"tap": "Hold near reader", "done": "Done"} },
  zh: { search: ['轻松记录', '每一笔开销'], payment: {"tap": "靠近读卡器", "done": "完成"} },
  es: { search: ['Registra gastos', 'sin esfuerzo'], payment: {"tap": "Acerca al lector", "done": "Listo"} },
  fr: { search: ['Suivez vos dépenses', 'sans effort'], payment: {"tap": "Approchez du lecteur", "done": "Terminé"} },
  de: { search: ['Ausgaben erfassen', 'ganz mühelos'], payment: {"tap": "An das Lesegerät halten", "done": "Fertig"} },
  pt: { search: ['Registre despesas', 'sem esforço'], payment: {"tap": "Aproxime do leitor", "done": "Concluído"} },
  it: { search: ['Registra le spese', 'senza sforzo'], payment: {"tap": "Avvicina al lettore", "done": "Fatto"} },
  ja: { search: ['支出を記録', 'かんたんに'], payment: {"tap": "リーダーにかざす", "done": "完了"} },
  ko: { search: ['지출을 기록하세요', '손쉽게'], payment: {"tap": "리더기에 가까이 대세요", "done": "완료"} },
  ru: { search: ['Учитывайте расходы', 'без усилий'], payment: {"tap": "Поднесите к терминалу", "done": "Готово"} },
  hi: { search: ['खर्च का हिसाब रखें', 'आसानी से'], payment: {"tap": "रीडर के पास रखें", "done": "हो गया"} },
  th: { search: ['ติดตามรายจ่าย', 'ได้อย่างง่ายดาย'], payment: {"tap": "นำเข้าใกล้เครื่องอ่าน", "done": "เสร็จสิ้น"} },
  vi: { search: ['Theo dõi chi tiêu', 'thật dễ dàng'], payment: {"tap": "Đưa gần đầu đọc", "done": "Xong"} },
  id: { search: ['Catat pengeluaran', 'dengan mudah'], payment: {"tap": "Dekatkan ke pembaca", "done": "Selesai"} },
  ms: { search: ['Jejak perbelanjaan', 'dengan mudah'], payment: {"tap": "Dekatkan pada pembaca", "done": "Selesai"} },
  fil: { search: ['Itala ang gastos', 'nang madali'], payment: {"tap": "Ilapit sa reader", "done": "Tapos na"} },
  tr: { search: ['Giderlerini takip et', 'zahmetsizce'], payment: {"tap": "Okuyucuya yaklaştırın", "done": "Tamam"} },
  pl: { search: ['Śledź wydatki', 'bez wysiłku'], payment: {"tap": "Zbliż do czytnika", "done": "Gotowe"} },
  nl: { search: ['Houd uitgaven bij', 'zonder moeite'], payment: {"tap": "Houd bij de lezer", "done": "Gereed"} },
  uk: { search: ['Відстежуйте витрати', 'без зусиль'], payment: {"tap": "Піднесіть до термінала", "done": "Готово"} },
  sv: { search: ['Håll koll på utgifter', 'utan ansträngning'], payment: {"tap": "Håll nära läsaren", "done": "Klart"} },
  nb: { search: ['Følg utgiftene', 'enkelt'], payment: {"tap": "Hold nær leseren", "done": "Ferdig"} },
  da: { search: ['Følg dine udgifter', 'helt ubesværet'], payment: {"tap": "Hold tæt på læseren", "done": "Færdig"} },
};
