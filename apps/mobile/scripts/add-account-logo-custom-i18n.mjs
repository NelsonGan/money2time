// One-off: patches the custom-logo (upload) keys into the existing
// `accounts.logo` block of every locale file. Idempotent — only inserts keys
// that are missing. Falls back to English for any locale not listed.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = path.resolve(__dirname, '../lib/i18n/locales');

const KEYS = [
  'tab_library',
  'tab_custom',
  'upload',
  'recommended_size',
  'permission_title',
  'permission_message',
  'upload_failed',
  'delete_title',
  'delete_message',
];

const en = {
  tab_library: 'Library',
  tab_custom: 'Custom',
  upload: 'Upload',
  recommended_size: 'Recommended {{size}}×{{size}} px · cropped to fit',
  permission_title: 'Photo access needed',
  permission_message: 'Allow photo library access to upload a custom logo.',
  upload_failed: 'Could not use that image. Please try another.',
  delete_title: 'Delete logo?',
  delete_message: 'This custom logo will be removed.',
};

const T = {
  en,
  zh: {
    tab_library: '图库',
    tab_custom: '自定义',
    upload: '上传',
    recommended_size: '建议 {{size}}×{{size}} 像素 · 自动裁剪适配',
    permission_title: '需要照片访问权限',
    permission_message: '允许访问照片库以上传自定义标志。',
    upload_failed: '无法使用该图片，请换一张试试。',
    delete_title: '删除标志？',
    delete_message: '此自定义标志将被移除。',
  },
  es: {
    tab_library: 'Biblioteca',
    tab_custom: 'Personalizado',
    upload: 'Subir',
    recommended_size: 'Recomendado {{size}}×{{size}} px · recortado al tamaño',
    permission_title: 'Se necesita acceso a fotos',
    permission_message: 'Permite el acceso a la galería para subir un logo personalizado.',
    upload_failed: 'No se pudo usar esa imagen. Prueba con otra.',
    delete_title: '¿Eliminar logo?',
    delete_message: 'Este logo personalizado se eliminará.',
  },
  fr: {
    tab_library: 'Bibliothèque',
    tab_custom: 'Personnalisé',
    upload: 'Importer',
    recommended_size: 'Recommandé {{size}}×{{size}} px · rogné pour s’adapter',
    permission_title: 'Accès aux photos requis',
    permission_message: 'Autorisez l’accès à la photothèque pour importer un logo personnalisé.',
    upload_failed: 'Impossible d’utiliser cette image. Essayez-en une autre.',
    delete_title: 'Supprimer le logo ?',
    delete_message: 'Ce logo personnalisé sera supprimé.',
  },
  de: {
    tab_library: 'Bibliothek',
    tab_custom: 'Eigenes',
    upload: 'Hochladen',
    recommended_size: 'Empfohlen {{size}}×{{size}} px · zugeschnitten',
    permission_title: 'Fotozugriff erforderlich',
    permission_message:
      'Erlaube den Zugriff auf die Fotomediathek, um ein eigenes Logo hochzuladen.',
    upload_failed: 'Dieses Bild konnte nicht verwendet werden. Bitte ein anderes wählen.',
    delete_title: 'Logo löschen?',
    delete_message: 'Dieses eigene Logo wird entfernt.',
  },
  pt: {
    tab_library: 'Biblioteca',
    tab_custom: 'Personalizado',
    upload: 'Enviar',
    recommended_size: 'Recomendado {{size}}×{{size}} px · cortado para caber',
    permission_title: 'Acesso às fotos necessário',
    permission_message: 'Permita o acesso à galeria para enviar um logo personalizado.',
    upload_failed: 'Não foi possível usar essa imagem. Tente outra.',
    delete_title: 'Excluir logo?',
    delete_message: 'Este logo personalizado será removido.',
  },
  it: {
    tab_library: 'Libreria',
    tab_custom: 'Personalizzato',
    upload: 'Carica',
    recommended_size: 'Consigliato {{size}}×{{size}} px · ritagliato per adattarsi',
    permission_title: 'Serve l’accesso alle foto',
    permission_message:
      'Consenti l’accesso alla libreria foto per caricare un logo personalizzato.',
    upload_failed: 'Impossibile usare questa immagine. Provane un’altra.',
    delete_title: 'Eliminare il logo?',
    delete_message: 'Questo logo personalizzato sarà rimosso.',
  },
  nl: {
    tab_library: 'Bibliotheek',
    tab_custom: 'Aangepast',
    upload: 'Uploaden',
    recommended_size: 'Aanbevolen {{size}}×{{size}} px · bijgesneden',
    permission_title: 'Toegang tot foto’s nodig',
    permission_message: 'Geef toegang tot de fotobibliotheek om een eigen logo te uploaden.',
    upload_failed: 'Kan die afbeelding niet gebruiken. Probeer een andere.',
    delete_title: 'Logo verwijderen?',
    delete_message: 'Dit aangepaste logo wordt verwijderd.',
  },
  ja: {
    tab_library: 'ライブラリ',
    tab_custom: 'カスタム',
    upload: 'アップロード',
    recommended_size: '推奨 {{size}}×{{size}} px・自動でトリミング',
    permission_title: '写真へのアクセスが必要',
    permission_message:
      'カスタムロゴをアップロードするには写真ライブラリへのアクセスを許可してください。',
    upload_failed: 'この画像は使用できません。別の画像をお試しください。',
    delete_title: 'ロゴを削除しますか？',
    delete_message: 'このカスタムロゴは削除されます。',
  },
  ko: {
    tab_library: '라이브러리',
    tab_custom: '사용자 지정',
    upload: '업로드',
    recommended_size: '권장 {{size}}×{{size}} px · 맞춰서 자동 크롭',
    permission_title: '사진 접근 권한 필요',
    permission_message: '사용자 지정 로고를 업로드하려면 사진 라이브러리 접근을 허용하세요.',
    upload_failed: '이 이미지를 사용할 수 없습니다. 다른 이미지를 선택하세요.',
    delete_title: '로고를 삭제할까요?',
    delete_message: '이 사용자 지정 로고가 삭제됩니다.',
  },
  ru: {
    tab_library: 'Галерея',
    tab_custom: 'Свой',
    upload: 'Загрузить',
    recommended_size: 'Рекомендуется {{size}}×{{size}} px · обрезка по размеру',
    permission_title: 'Нужен доступ к фото',
    permission_message: 'Разрешите доступ к фотогалерее, чтобы загрузить свой логотип.',
    upload_failed: 'Не удалось использовать это изображение. Попробуйте другое.',
    delete_title: 'Удалить логотип?',
    delete_message: 'Этот пользовательский логотип будет удалён.',
  },
  th: {
    tab_library: 'คลัง',
    tab_custom: 'กำหนดเอง',
    upload: 'อัปโหลด',
    recommended_size: 'แนะนำ {{size}}×{{size}} px · ครอบตัดให้พอดี',
    permission_title: 'ต้องการสิทธิ์เข้าถึงรูปภาพ',
    permission_message: 'อนุญาตการเข้าถึงคลังรูปภาพเพื่ออัปโหลดโลโก้ที่กำหนดเอง',
    upload_failed: 'ใช้รูปภาพนี้ไม่ได้ โปรดลองรูปอื่น',
    delete_title: 'ลบโลโก้?',
    delete_message: 'โลโก้ที่กำหนดเองนี้จะถูกลบออก',
  },
  tr: {
    tab_library: 'Kitaplık',
    tab_custom: 'Özel',
    upload: 'Yükle',
    recommended_size: 'Önerilen {{size}}×{{size}} px · sığacak şekilde kırpılır',
    permission_title: 'Fotoğraf erişimi gerekli',
    permission_message: 'Özel logo yüklemek için fotoğraf kitaplığına erişime izin verin.',
    upload_failed: 'Bu görsel kullanılamadı. Lütfen başka birini deneyin.',
    delete_title: 'Logo silinsin mi?',
    delete_message: 'Bu özel logo kaldırılacak.',
  },
  uk: {
    tab_library: 'Галерея',
    tab_custom: 'Власний',
    upload: 'Завантажити',
    recommended_size: 'Рекомендовано {{size}}×{{size}} px · обрізано за розміром',
    permission_title: 'Потрібен доступ до фото',
    permission_message: 'Дозвольте доступ до фотогалереї, щоб завантажити власний логотип.',
    upload_failed: 'Не вдалося використати це зображення. Спробуйте інше.',
    delete_title: 'Видалити логотип?',
    delete_message: 'Цей власний логотип буде видалено.',
  },
  vi: {
    tab_library: 'Thư viện',
    tab_custom: 'Tùy chỉnh',
    upload: 'Tải lên',
    recommended_size: 'Khuyến nghị {{size}}×{{size}} px · cắt cho vừa',
    permission_title: 'Cần quyền truy cập ảnh',
    permission_message: 'Cho phép truy cập thư viện ảnh để tải lên logo tùy chỉnh.',
    upload_failed: 'Không thể dùng ảnh đó. Vui lòng thử ảnh khác.',
    delete_title: 'Xóa logo?',
    delete_message: 'Logo tùy chỉnh này sẽ bị xóa.',
  },
  id: {
    tab_library: 'Pustaka',
    tab_custom: 'Khusus',
    upload: 'Unggah',
    recommended_size: 'Disarankan {{size}}×{{size}} px · dipotong agar pas',
    permission_title: 'Perlu akses foto',
    permission_message: 'Izinkan akses galeri foto untuk mengunggah logo khusus.',
    upload_failed: 'Tidak dapat menggunakan gambar itu. Coba yang lain.',
    delete_title: 'Hapus logo?',
    delete_message: 'Logo khusus ini akan dihapus.',
  },
  ms: {
    tab_library: 'Pustaka',
    tab_custom: 'Tersuai',
    upload: 'Muat naik',
    recommended_size: 'Disyorkan {{size}}×{{size}} px · dipangkas agar muat',
    permission_title: 'Akses foto diperlukan',
    permission_message: 'Benarkan akses pustaka foto untuk memuat naik logo tersuai.',
    upload_failed: 'Tidak dapat menggunakan imej itu. Sila cuba yang lain.',
    delete_title: 'Padam logo?',
    delete_message: 'Logo tersuai ini akan dialih keluar.',
  },
  fil: {
    tab_library: 'Library',
    tab_custom: 'Custom',
    upload: 'Mag-upload',
    recommended_size: 'Inirerekomenda {{size}}×{{size}} px · ki-crop para magkasya',
    permission_title: 'Kailangan ng access sa photos',
    permission_message: 'Payagan ang access sa photo library para mag-upload ng custom na logo.',
    upload_failed: 'Hindi magamit ang larawang iyon. Subukan ang iba.',
    delete_title: 'Tanggalin ang logo?',
    delete_message: 'Aalisin ang custom na logo na ito.',
  },
  hi: {
    tab_library: 'लाइब्रेरी',
    tab_custom: 'कस्टम',
    upload: 'अपलोड',
    recommended_size: 'अनुशंसित {{size}}×{{size}} px · फ़िट करने के लिए क्रॉप',
    permission_title: 'फ़ोटो एक्सेस आवश्यक',
    permission_message: 'कस्टम लोगो अपलोड करने के लिए फ़ोटो लाइब्रेरी एक्सेस की अनुमति दें।',
    upload_failed: 'उस छवि का उपयोग नहीं हो सका। कृपया दूसरी आज़माएँ।',
    delete_title: 'लोगो हटाएँ?',
    delete_message: 'यह कस्टम लोगो हटा दिया जाएगा।',
  },
  da: {
    tab_library: 'Bibliotek',
    tab_custom: 'Tilpasset',
    upload: 'Upload',
    recommended_size: 'Anbefalet {{size}}×{{size}} px · beskåret så det passer',
    permission_title: 'Adgang til fotos kræves',
    permission_message: 'Tillad adgang til fotobiblioteket for at uploade et tilpasset logo.',
    upload_failed: 'Kunne ikke bruge det billede. Prøv et andet.',
    delete_title: 'Slet logo?',
    delete_message: 'Dette tilpassede logo fjernes.',
  },
  nb: {
    tab_library: 'Bibliotek',
    tab_custom: 'Egendefinert',
    upload: 'Last opp',
    recommended_size: 'Anbefalt {{size}}×{{size}} px · beskåret for å passe',
    permission_title: 'Trenger tilgang til bilder',
    permission_message: 'Gi tilgang til bildebiblioteket for å laste opp en egendefinert logo.',
    upload_failed: 'Kunne ikke bruke det bildet. Prøv et annet.',
    delete_title: 'Slette logo?',
    delete_message: 'Denne egendefinerte logoen fjernes.',
  },
  sv: {
    tab_library: 'Bibliotek',
    tab_custom: 'Anpassad',
    upload: 'Ladda upp',
    recommended_size: 'Rekommenderat {{size}}×{{size}} px · beskuren för att passa',
    permission_title: 'Åtkomst till foton krävs',
    permission_message: 'Tillåt åtkomst till fotobiblioteket för att ladda upp en egen logga.',
    upload_failed: 'Kunde inte använda den bilden. Prova en annan.',
    delete_title: 'Ta bort logga?',
    delete_message: 'Den här anpassade loggan tas bort.',
  },
  pl: {
    tab_library: 'Biblioteka',
    tab_custom: 'Własne',
    upload: 'Prześlij',
    recommended_size: 'Zalecane {{size}}×{{size}} px · przycięte do rozmiaru',
    permission_title: 'Wymagany dostęp do zdjęć',
    permission_message: 'Zezwól na dostęp do biblioteki zdjęć, aby przesłać własne logo.',
    upload_failed: 'Nie można użyć tego obrazu. Spróbuj innego.',
    delete_title: 'Usunąć logo?',
    delete_message: 'To własne logo zostanie usunięte.',
  },
};

const esc = (s) => s.replace(/'/g, "\\'");

async function main() {
  const files = (await fs.readdir(LOCALES_DIR)).filter((f) => f.endsWith('.ts'));
  for (const file of files) {
    const locale = file.replace(/\.ts$/, '');
    const values = { ...en, ...(T[locale] ?? {}) };
    const full = path.join(LOCALES_DIR, file);
    let src = await fs.readFile(full, 'utf8');

    const logoOpen = src.match(/^(\s*)logo:\s*\{/m);
    if (!logoOpen) {
      console.warn(`skip ${file}: no accounts.logo block`);
      continue;
    }
    const blockEnd = src.indexOf('},', logoOpen.index);
    const blockSlice = src.slice(logoOpen.index, blockEnd);
    let changed = false;
    for (const key of KEYS) {
      if (new RegExp(`\\b${key}:`).test(blockSlice)) continue;
      const insert = `      ${key}: '${esc(values[key])}',\n`;
      const at = src.indexOf('},', logoOpen.index);
      src = `${src.slice(0, at)}${insert}${src.slice(at)}`;
      changed = true;
    }
    if (changed) {
      await fs.writeFile(full, src, 'utf8');
      console.log(`patched ${file}`);
    } else {
      console.log(`ok ${file}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
